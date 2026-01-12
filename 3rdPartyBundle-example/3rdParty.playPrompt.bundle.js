define('3rdparty.bundle', [], function () {

  console.log('#### 3rdParty.playPrompt.bundle.js loaded');

  // Load the Five9 CRM SDK inside an invisible iframe to avoid polluting the host page
  function loadSdkInIframe(url, callback) {
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.onload = function () {
      console.log('#### Iframe loaded, injecting script:', url);
      loadScriptInIframe(iframe, url)
        .then((Five9Sdk) => {
          console.log('#### Five9 CRM SDK loaded successfully in iframe');
          if (callback) callback(Five9Sdk);
        })
        .catch((error) => {
          console.error('#### Error loading Five9 SDK:', error);
        });
    };

    function loadScriptInIframe(iframe, url) {
      return new Promise((resolve, reject) => {
        console.log('#### Loading SDK Script inside iframe:', url);
        var script = iframe.contentDocument.createElement('script');
        script.type = 'text/javascript';
        script.src = url;
        script.async = true;

        script.onload = () => {
          console.log('#### SDK Script loaded inside iframe:', url);
          resolve(iframe.contentWindow.Five9);
        };

        script.onerror = () => {
          console.error('#### Failed to load SDK script inside iframe:', url);
          reject(new Error('Failed to load script inside iframe: ' + url));
        };

        iframe.contentDocument.head.appendChild(script);
      });
    }

    iframe.src = 'about:blank';
  }

  // custom logger for easy searching and filtering in console
  const defaultLoggingPrefix = '[#### 3rdParty.playPrompt.bundle.js]';
  const allowedLoggingModes = ['error', 'warn', 'log', 'info', 'debug'];
  class ConsoleLogger {
    constructor(prefix = defaultLoggingPrefix) {
      this.prefix = prefix;
      allowedLoggingModes.forEach((mode) => {
        this[mode] = (...messages) => {
          const d = new Date();
          console[mode](
            `${this.prefix} (${d.toLocaleString(undefined, {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}) ${messages
              .map((m) => (typeof m === 'object' ? `\n${JSON.stringify(m)}` : m))
              .join(' ')}`
          );
        };
      });
    }
  }
  const log = new ConsoleLogger();

  // Configure behavior
  const promptPlayOnCallTypes = [
    'AGENT',
    'QUEUE_CALLBACK',
    'MANUAL',
    'INBOUND',
    'OUTBOUND',
    'PREVIEW',
  ];

  // Change this to the exact prompt name you want to play (case sensitive)
  const promptNamePlayOnConnect = 'QRL';

  loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', function (Five9Sdk) {
    if (!Five9Sdk || !Five9Sdk.CrmSdk) {
      console.error('#### SDK load failed or CrmSdk is undefined');
      return;
    }

    const interactionApi = Five9Sdk.CrmSdk.interactionApi();
    const hookApi = Five9Sdk.CrmSdk.hookApi(); // reserved for future use

    if (!interactionApi) {
      console.error('#### Interaction API not available');
      return;
    }

    log.log('Customization Loaded');

    let f9UserId;
    let f9UserName;

    // Play prompt by ID; avoid replay within the same interaction by caching in localStorage
    const playPromptById = (agentId, interactionId, promptId, replayPrompt = false) => {
      log.log(`Playing Prompt id=${promptId} for interaction=${interactionId}`);

      const playedKey = `promptPlayed_${interactionId}_${promptId}`;
      const alreadyPlayed = !!localStorage.getItem(playedKey);
      if (alreadyPlayed && !replayPrompt) {
        log.log('Prompt already played for this interaction; skipping');
        return;
      }

      interactionApi
        .executeRestApi({
          path: `/appsvcs/rs/svc/agents/${agentId}/interactions/calls/${interactionId}/audio/player/play_prompt`,
          method: 'PUT',
          payload: JSON.stringify({ value: promptId }),
        })
        .then(
          function (result) {
            log.log('Play Prompt Result:', result);
            if (result.status >= 200 && result.status < 300) {
              localStorage.setItem(playedKey, 'true');
            }
          },
          function (err) {
            log.error('Play Prompt FAILED:', err);
          }
        );
    };

    // Fetch prompts and play the one matching the given name
    const playPromptByName = (targetPromptName, agentId, interactionId) => {
      log.log(`Attempting to play prompt by name: ${targetPromptName}`);
      interactionApi
        .executeRestApi({
          path: `/appsvcs/rs/svc/agents/${agentId}/prompts`,
          method: 'GET',
          payload: null,
        })
        .then(
          function (result) {
            let availablePrompts = [];
            try {
              availablePrompts = JSON.parse(result.response || '[]');
            } catch (e) {
              log.error('Failed parsing prompts response:', e);
              return;
            }
            log.debug('Available Prompts:', availablePrompts);

            const match = availablePrompts.find((p) => p && p.name === targetPromptName);
            if (match && match.id) {
              log.log(`Found prompt "${targetPromptName}" with id ${match.id}`);
              playPromptById(agentId, interactionId, match.id);
            } else {
              log.warn(`Prompt named "${targetPromptName}" not found in available prompts`);
            }
          },
          function (err) {
            log.error('FAILED to get prompts:', err);
          }
        );
    };

    // Subscribe to interaction events
    interactionApi.subscribe({
      callAccepted: (evt) => {
        const currentInteractionId = evt.callData && evt.callData.interactionId;
        f9UserId = evt.callData && evt.callData.agentId;
        f9UserName = evt.callData && evt.callData.agentName;

        log.log('Call Accepted:', evt);
        log.log(`Current Interaction Id: ${currentInteractionId}`);
        if (currentInteractionId && f9UserId) {
          playPromptByName(promptNamePlayOnConnect, f9UserId, currentInteractionId);
        }
      },
      callEnded: (evt) => {
        log.log('Call Ended:', evt);
      },
    });

    // Also subscribe to WS events to catch transitions to TALKING on connect
    interactionApi.subscribeWsEvent({
      '4': function (payLoad, context) {
        log.debug('Interaction Updated');
        log.debug('context:', context);
        log.debug('payLoad:', payLoad);

        try {
          if (
            payLoad &&
            promptPlayOnCallTypes.includes(payLoad.callType) &&
            payLoad.state === 'TALKING' &&
            context && context.eventReason === 'CONNECTED'
          ) {
            log.debug(`Playing Prompt ${promptNamePlayOnConnect}, agentId: ${f9UserId}, interactionId: ${payLoad.id}`);
            if (f9UserId && payLoad.id) {
              playPromptByName(promptNamePlayOnConnect, f9UserId, payLoad.id);
            }
          }
        } catch (e) {
          log.error('Error handling WS event 4:', e);
        }
      },
      '29': function (payLoad, context) {
        log.debug('Statistics Updated Event');
        log.debug('context:', context);
        log.debug('payLoad:', payLoad);
      },
    });
  });
});
