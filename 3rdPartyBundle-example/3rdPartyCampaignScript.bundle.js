define('3rdparty.bundle', [], function () {
  console.log('#### 3rdPartyCampaignScript.bundle.js loaded');

  let cachedOrgId = null;
  let sdkApiBaseURL = null;
  let campaignScriptWindow = null;
  let campaignScriptState = {
    interactionId: null,
    inFlight: false,
    launched: false,
  };

  // The SDK deliberately hides its application context (and thus the real Five9
  // API host). It does, however, issue authenticated XHRs to that host from the
  // SDK iframe. Wrap that iframe's XHR.open so we can capture the absolute API
  // base URL and reuse it for our own binary (ArrayBuffer) request.
  function patchSdkXhrToCaptureApiBase(sdkWindow) {
    try {
      const proto = sdkWindow && sdkWindow.XMLHttpRequest && sdkWindow.XMLHttpRequest.prototype;
      if (!proto || proto.__f9ApiBasePatched) {
        return;
      }
      const originalOpen = proto.open;
      proto.open = function (method, url) {
        try {
          if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            const marker = '/appsvcs/';
            const idx = url.indexOf(marker);
            if (idx > 0) {
              sdkApiBaseURL = url.substring(0, idx);
            }
          }
        } catch (captureError) {
          // Non-fatal: capturing the base URL is best-effort.
        }
        return originalOpen.apply(this, arguments);
      };
      proto.__f9ApiBasePatched = true;
    } catch (e) {
      console.warn('#### Could not patch SDK XHR to capture API base URL:', e);
    }
  }

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
          patchSdkXhrToCaptureApiBase(iframe.contentWindow);
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

  function normalizeCampaignId(value) {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized || null;
  }

  function extractCampaignId(callEvent) {
    const callData = callEvent?.callData || callEvent || {};
    return normalizeCampaignId(
      callData.campaignId ||
        callData.campaign?.id ||
        callData.campaign?.campaignId ||
        callEvent?.campaignId ||
        callEvent?.campaign?.id
    );
  }

  async function getOrgId(interactionApi) {
    if (cachedOrgId) return cachedOrgId;

    const res = await interactionApi.executeRestApi({
      path: '/appsvcs/rs/svc/auth/metadata',
      method: 'GET',
      payload: null,
    });

    let meta = null;
    try {
      meta = JSON.parse(res.response || 'null');
    } catch (e) {
      console.error('#### Failed to parse auth/metadata response', e, res);
    }

    const orgId = meta?.orgId || meta?.org?.id || meta?.organizationId;
    if (!orgId) {
      console.warn('#### auth/metadata did not include orgId; response:', meta);
      return null;
    }

    cachedOrgId = orgId;
    console.log('#### Cached orgId:', cachedOrgId);
    return cachedOrgId;
  }

  function openCampaignScriptWindow(interactionId, campaignId) {
    if (campaignScriptWindow && !campaignScriptWindow.closed) {
      try {
        if (campaignScriptState.interactionId === interactionId) {
          campaignScriptWindow.focus();
          return campaignScriptWindow;
        }
        campaignScriptWindow.close();
      } catch (e) {
        console.warn('#### Failed to close prior campaign script window:', e);
      }
    }

    campaignScriptWindow = window.open('', '_blank', 'width=1100,height=850,resizable=yes,scrollbars=yes');
    if (!campaignScriptWindow) {
      console.warn('#### Popup blocked; campaign script cannot be opened in a new window.');
      return null;
    }

    campaignScriptState.interactionId = interactionId;
    campaignScriptWindow.document.open();
    campaignScriptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Loading campaign script...</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 24px;
              color: #1f2937;
            }
            .status {
              font-size: 14px;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="status">
            Loading campaign script for interaction ${interactionId || 'unknown'}...
            <br />
            Campaign ${campaignId || 'unknown'}
          </div>
        </body>
      </html>
    `);
    campaignScriptWindow.document.close();
    campaignScriptWindow.focus();
    return campaignScriptWindow;
  }

  async function inflateZlibBytes(compressedBuffer) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream is not available in this browser.');
    }

    const formats = ['deflate', 'gzip'];
    let lastError = null;

    for (const format of formats) {
      try {
        const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream(format));
        return await new Response(stream).arrayBuffer();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to inflate campaign script payload.');
  }

  function toUint8Array(body) {
    if (body == null) {
      return new Uint8Array();
    }

    if (body instanceof Uint8Array) {
      return body;
    }

    if (body instanceof ArrayBuffer) {
      return new Uint8Array(body);
    }

    if (Array.isArray(body)) {
      return new Uint8Array(body);
    }

    if (typeof body === 'string') {
      const bytes = new Uint8Array(body.length);
      for (let index = 0; index < body.length; index += 1) {
        bytes[index] = body.charCodeAt(index) & 0xff;
      }
      return bytes;
    }

    throw new Error(`Unsupported campaign script payload type: ${typeof body}`);
  }

  function decodeCampaignScript(scriptBytes) {
    const bytes = scriptBytes instanceof Uint8Array ? scriptBytes : new Uint8Array(scriptBytes);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.slice(3));
    }

    return new TextDecoder('windows-1252').decode(bytes);
  }

  // Fetch raw bytes via a credentialed XHR. The Five9 SDK's executeRestApi reads
  // the response as text (default responseType), which UTF-8-decodes and corrupts
  // the binary zlib payload. Requesting an ArrayBuffer keeps the bytes intact.
  function requestArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.open('GET', url, true);
      req.withCredentials = true;
      req.responseType = 'arraybuffer';
      req.onreadystatechange = function () {
        if (req.readyState !== 4) {
          return;
        }
        if (req.status >= 200 && req.status < 300) {
          resolve(req.response);
        } else {
          reject(new Error(`HTTP ${req.status} while fetching campaign script.`));
        }
      };
      req.onerror = () => reject(new Error('Network error while fetching campaign script.'));
      req.send();
    });
  }

  async function decodeScriptBytes(bytes) {
    try {
      const decompressedBuffer = await inflateZlibBytes(bytes);
      return decodeCampaignScript(decompressedBuffer);
    } catch (inflateError) {
      // If the payload wasn't compressed (e.g. a gateway already inflated it),
      // decode the bytes directly by BOM instead of failing.
      console.warn('#### Inflate failed; decoding bytes as-is.', inflateError);
      return decodeCampaignScript(bytes);
    }
  }

  async function fetchCampaignScriptText(interactionApi, orgId, campaignId) {
    const path = `/appsvcs/rs/svc/orgs/${encodeURIComponent(orgId)}/campaigns/${encodeURIComponent(campaignId)}/script`;

    // Preferred: fetch the raw bytes from the real Five9 API host so inflate/decode
    // operate on intact data. sdkApiBaseURL is captured from the SDK's own XHRs;
    // getOrgId() runs first and triggers a capture before we reach this point.
    if (sdkApiBaseURL) {
      try {
        const buffer = await requestArrayBuffer(sdkApiBaseURL + path);
        return await decodeScriptBytes(new Uint8Array(buffer));
      } catch (binaryError) {
        console.warn('#### Binary fetch failed; falling back to SDK executeRestApi.', binaryError);
      }
    } else {
      console.warn('#### SDK API base URL not captured yet; using SDK executeRestApi.');
    }

    // Fallback: route through the SDK (text response). Bytes may be lossy here,
    // but this preserves behavior when the direct XHR is blocked.
    const response = await interactionApi.executeRestApi({
      path,
      method: 'GET',
      payload: null,
    });

    const status = response?.status;
    if (typeof status === 'number' && (status < 200 || status >= 300)) {
      throw new Error(`HTTP ${status} while fetching campaign script.`);
    }

    const raw = response?.response ?? response?.body ?? response;
    try {
      return await decodeScriptBytes(toUint8Array(raw));
    } catch (inflateError) {
      if (typeof raw === 'string' && raw.length) {
        console.warn('#### Inflate failed; using raw response text as script.', inflateError);
        return raw;
      }
      throw inflateError;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Escape a CAV value for safe insertion into HTML text or attribute contexts.
  function escapeCavValue(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Fetch the active call's CAVs and index them by "Group.Name" for placeholder
  // substitution. Returns an empty map on failure so rendering can still proceed.
  async function getCallCavMap(interactionApi, interactionId) {
    const map = {};
    if (!interactionId) {
      return map;
    }

    const response = await interactionApi.getCav({ interactionId });
    const cavs = Array.isArray(response)
      ? response
      : (Array.isArray(response?.cavs) ? response.cavs : []);

    cavs.forEach((cav) => {
      if (cav && cav.group != null && cav.name != null) {
        map[`${cav.group}.${cav.name}`] = cav.value != null ? cav.value : '';
      }
    });

    return map;
  }

  // Replace @Group.Name@ placeholders with the matching CAV value. Placeholders
  // without a matching CAV are left untouched, mirroring the native agent app.
  function applyCavPlaceholders(html, cavMap) {
    if (!html) {
      return html;
    }

    return html.replace(/@([A-Za-z0-9_]+\.[^@]+?)@/g, function (fullMatch, token) {
      if (Object.prototype.hasOwnProperty.call(cavMap, token)) {
        return escapeCavValue(cavMap[token]);
      }
      return fullMatch;
    });
  }

  function buildDocumentShell(title, bodyHtml) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111827; background: #f8fafc; }
      .meta { margin-bottom: 16px; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 10px; background: #ffffff; font-size: 13px; line-height: 1.5; }
      .script { padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff; white-space: pre-wrap; word-break: break-word; font-size: 15px; line-height: 1.6; }
      .error { padding: 20px; border: 1px solid #fca5a5; border-radius: 12px; background: #fef2f2; color: #991b1b; font-size: 14px; line-height: 1.6; }
    </style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
  }

  function buildMetaBlock(interactionId, campaignId) {
    return `<div class="meta"><strong>Interaction:</strong> ${escapeHtml(interactionId || 'unknown')}<br /><strong>Campaign:</strong> ${escapeHtml(campaignId || 'unknown')}</div>`;
  }

  function buildErrorDocument(message, interactionId, campaignId) {
    const body = buildMetaBlock(interactionId, campaignId) + `<div class="error">Unable to load campaign script.<br />${escapeHtml(message)}</div>`;
    return buildDocumentShell('Campaign Script - Error', body);
  }

  // Push a fully-formed HTML document into the child window in a single step.
  function pushHtmlToChild(childWindow, html) {
    if (!childWindow || childWindow.closed) {
      return;
    }

    try {
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      childWindow.location.replace(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      // Fallback to a direct document write if Blob URLs are unavailable.
      try {
        childWindow.document.open();
        childWindow.document.write(html);
        childWindow.document.close();
      } catch (writeError) {
        console.error('#### Failed to write campaign script into child window:', writeError);
      }
    }
  }

  // Close the campaign script window and reset state. Safe to call repeatedly.
  function teardownCampaignScriptWindow() {
    if (campaignScriptWindow && !campaignScriptWindow.closed) {
      try {
        campaignScriptWindow.close();
      } catch (e) {
        console.warn('#### Failed to close campaign script window:', e);
      }
    }
    campaignScriptWindow = null;
    campaignScriptState = {
      interactionId: null,
      inFlight: false,
      launched: false,
    };
  }

  async function launchCampaignScript(interactionApi, callEvent, sourceLabel) {
    const interactionId = callEvent?.callData?.interactionId || callEvent?.interactionId || null;
    if (!interactionId) {
      console.warn(`#### No interactionId present on ${sourceLabel}; skipping campaign script launch.`);
      return;
    }

    if (campaignScriptState.launched && campaignScriptState.interactionId === interactionId) {
      return;
    }

    if (campaignScriptState.inFlight && campaignScriptState.interactionId === interactionId) {
      return;
    }

    const campaignId = extractCampaignId(callEvent);
    if (!campaignId) {
      console.warn(`#### No campaignId present on ${sourceLabel}; skipping campaign script launch.`);
      return;
    }

    // Open the child window synchronously so the browser doesn't block the popup.
    const childWindow = openCampaignScriptWindow(interactionId, campaignId);
    if (!childWindow) {
      return;
    }

    campaignScriptState = {
      interactionId,
      inFlight: true,
      launched: false,
    };

    // All fetching, inflating, decoding, and HTML assembly happen here in the
    // parent customization; the child window only receives the final document.
    try {
      const orgId = await getOrgId(interactionApi);
      if (!orgId) {
        pushHtmlToChild(childWindow, buildErrorDocument('Could not resolve Five9 orgId.', interactionId, campaignId));
        return;
      }

      const script = await fetchCampaignScriptText(interactionApi, orgId, campaignId);

      // Pre-process the script the way the native agent does: replace CAV
      // placeholders (@Group.Name@) with the call's actual CAV values. Any
      // placeholder without a matching CAV is left as-is.
      let rendered = script;
      try {
        const cavMap = await getCallCavMap(interactionApi, interactionId);
        rendered = applyCavPlaceholders(script, cavMap);
      } catch (cavError) {
        console.warn('#### Failed to load CAVs for placeholder substitution; rendering script unmodified.', cavError);
      }

      // The campaign script is a full HTML document; render it as-is so it is the
      // only content in the window.
      pushHtmlToChild(childWindow, rendered);
      campaignScriptState.launched = true;
      console.log(`#### Launched campaign script for campaign ${campaignId} on interaction ${interactionId}`);
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      pushHtmlToChild(childWindow, buildErrorDocument(message, interactionId, campaignId));
      console.error('#### Failed to launch campaign script:', e);
    } finally {
      campaignScriptState.inFlight = false;
    }
  }

  loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', async function (Five9Sdk) {
    if (!Five9Sdk || !Five9Sdk.CrmSdk) {
      console.error('#### SDK load failed or CrmSdk is undefined');
      return;
    }

    const interactionApi = Five9Sdk.CrmSdk.interactionApi();
    const hookApi = Five9Sdk.CrmSdk.hookApi();

    if (!interactionApi) {
      console.error('#### Interaction API not available');
      return;
    }

    console.log('#### Campaign Script sample loaded');

    interactionApi.subscribe({
      callStarted: (callEvent) => {
        console.log('#### callStarted:', callEvent);
        launchCampaignScript(interactionApi, callEvent, 'callStarted');
      },
      callAccepted: (callEvent) => {
        console.log('#### callAccepted:', callEvent);
        launchCampaignScript(interactionApi, callEvent, 'callAccepted');
      },
      callEnded: (callEvent) => {
        // Intentionally keep the window open on call end. The agent may still need
        // the script while dispositioning; teardown happens on disposition instead.
        console.log('#### callEnded (window kept open until disposition):', callEvent);
      },
    });

    // Also tear down when the interaction is dispositioned. WS event 5 fires after
    // the agent completes disposition (Interaction Ended and Dispositioned), which
    // is the reliable point to close the window and avoid orphaned windows.
    interactionApi.subscribeWsEvent({
      '5': function (payLoad, context) {
        console.log('#### WS event 5 (Interaction Ended and Dispositioned):', context?.eventReason);
        teardownCampaignScriptWindow();
      },
    });

    if (hookApi && typeof hookApi.registerApi === 'function') {
      hookApi.registerApi({
        afterScreenPop: function (screenPopData) {
          console.log('#### afterScreenPop:', screenPopData);
          return Promise.resolve({
            status: { statusCode: Five9Sdk.CrmSdk.HookStatusCode.Proceed },
          });
        },
      });
    }
  });
});
