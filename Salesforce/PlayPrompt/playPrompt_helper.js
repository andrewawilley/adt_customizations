/*
 * DISCLAIMER:
 * This sample code is provided for illustrative purposes and should not be treated as officially supported software by Five9.
 * By using this code, you understand that any customization, modification, or deployment is solely your responsibility if you 
 * choose not to engage with Five9's professional services team.
 * 
 * While this example demonstrates how a customization can be built, it is recommended that you consult with our professional 
 * services team for a fully supported and tailored solution to meet your specific needs.
 */

({
  init: function (cmp) {
    // This customization plays a prompt on connect/Talking and optionally via button click.
    // The prompt identified must be assigned to a skill that the agent is assigned to.

    if (!window.Five9 || !window.Five9.CrmSdk) {
      // ltng:require should prevent this, but guard anyway.
      // eslint-disable-next-line no-console
      console.warn("Five9 CrmSdk not available yet");
      return;
    }

    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    // uncomment the call types you want to play the prompt on
    const promptPlayOnCallTypes = [
      "AGENT",
      "QUEUE_CALLBACK",
      "MANUAL",
      "INBOUND",
      "OUTBOUND",
      "PREVIEW",
    ];

    const promptNamePlayOnConnect = "QRL";

    // --- logging ---
    const defaultLoggingPrefix = "[*****]";
    const allowedLoggingModes = ["error", "warn", "log", "info", "debug"];
    class ConsoleLogger {
      constructor(prefix = defaultLoggingPrefix) {
        this.prefix = prefix;
        allowedLoggingModes.forEach((mode) => {
          this[mode] = (...messages) => {
            const d = new Date();
            // eslint-disable-next-line no-console
            console[mode](
              `${this.prefix} (${d.toLocaleString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}) ${messages
                .map((message) => {
                  if (typeof message === "object") {
                    return `\n${JSON.stringify(message)}`;
                  }
                  return message;
                })
                .join(" ")}`
            );
          };
        });
      }
    }

    const console2 = new ConsoleLogger();
    console2.log("Customization Loaded");

    // Store state on the component instance so controller actions can reuse it.
    // eslint-disable-next-line no-underscore-dangle
    cmp._playPromptState = {
      hookApi,
      interactionApi,
      console2,
      promptPlayOnCallTypes,
      promptNamePlayOnConnect,
      f9UserId: null,
      lastInteractionId: null,
    };

    const playPromptById = (f9UserId, currentInteractionId, promptId, replayPrompt = false) => {
      console2.log(`Playing Prompt ${promptId}`);

      const playedKey = `promptPlayed_${currentInteractionId}_${promptId}`;
      const playedStatus = localStorage.getItem(playedKey);

      if (playedStatus && !replayPrompt) {
        console2.log("Prompt already played");
        return;
      }

      interactionApi
        .executeRestApi({
          path: `/appsvcs/rs/svc/agents/${f9UserId}/interactions/calls/${currentInteractionId}/audio/player/play_prompt`,
          method: "PUT",
          payload: JSON.stringify({
            value: promptId,
          }),
        })
        .then(
          function (result) {
            console2.log("Prompt Played Result:", result);
            if (result.status < 300 && result.status >= 200) {
              localStorage.setItem(playedKey, true);
            }
          },
          function (result) {
            console2.log("Prompt Played FAILED:", result);
          }
        );
    };

    const playPromptByName = (targetPromptName, f9UserId, currentInteractionId, replayPrompt = false) => {
      console2.log(`Attempting to play prompt ${targetPromptName}`);
      console2.log("Getting available prompts");

      interactionApi
        .executeRestApi({
          path: `/appsvcs/rs/svc/agents/${f9UserId}/prompts`,
          method: "GET",
          payload: null,
        })
        .then(
          function (result) {
            const availablePrompts = JSON.parse(result.response);
            console2.log("Available Prompts:", availablePrompts);

            availablePrompts.forEach((prompt) => {
              if (prompt.name === targetPromptName) {
                console2.log(`Found prompt ${targetPromptName} with id ${prompt.id}`);
                playPromptById(f9UserId, currentInteractionId, prompt.id, replayPrompt);
              }
            });
          },
          function (result) {
            console2.log("FAILED to get prompts:", result);
          }
        );
    };

    // Persist these fns for controller to call.
    // eslint-disable-next-line no-underscore-dangle
    cmp._playPromptFns = {
      playPromptByName,
    };

    // register callbacks to the interaction API
    interactionApi.subscribe({
      callAccepted: (interactionSubscriptionEvent) => {
        const currentInteractionId = interactionSubscriptionEvent.callData.interactionId;
        // eslint-disable-next-line no-underscore-dangle
        cmp._playPromptState.f9UserId = interactionSubscriptionEvent.callData.agentId;
        // eslint-disable-next-line no-underscore-dangle
        cmp._playPromptState.lastInteractionId = currentInteractionId;

        console2.log("Call Accepted:", interactionSubscriptionEvent);
        console2.log(`Current Interaction Id: ${currentInteractionId}`);
        playPromptByName(promptNamePlayOnConnect, cmp._playPromptState.f9UserId, currentInteractionId);
      },
      callEnded: (interactionSubscriptionEvent) => {
        console2.log("Call Ended:", interactionSubscriptionEvent);
      },
    });

    // subscribe to WsEvents
    interactionApi.subscribeWsEvent({
      "4": function (payLoad, context) {
        console2.debug("Interaction Updated");
        console2.debug("context:", context);
        console2.debug("payLoad:", payLoad);

        // eslint-disable-next-line no-underscore-dangle
        cmp._playPromptState.lastInteractionId = payLoad.id;

        if (
          promptPlayOnCallTypes.includes(payLoad.callType) &&
          payLoad.state === "TALKING" &&
          context.eventReason === "CONNECTED"
        ) {
          console2.debug(`context.eventReason: ${context.eventReason}`);
          console2.debug(`payLoad.state: ${payLoad.state}`);
          console2.debug(`payLoad.callType: ${payLoad.callType}`);
          console2.debug(
            `promptPlayOnCallTypes.includes(payLoad.callType): ${promptPlayOnCallTypes.includes(payLoad.callType)}`
          );
          // eslint-disable-next-line no-underscore-dangle
          console2.debug(
            `Playing Prompt ${promptNamePlayOnConnect}, f9UserId: ${cmp._playPromptState.f9UserId}, currentInteractionId: ${payLoad.id}`
          );
          // eslint-disable-next-line no-underscore-dangle
          playPromptByName(promptNamePlayOnConnect, cmp._playPromptState.f9UserId, payLoad.id);
        }
      },
      "29": function (payLoad, context) {
        console2.debug("Statistics Updated Event");
        console2.debug("context:", context);
        console2.debug("payLoad:", payLoad);
      },
    });

    // Keep lint happy about unused variable in some orgs
    void hookApi;
  },

  playPromptOnDemand: function (cmp) {
    // eslint-disable-next-line no-underscore-dangle
    const state = cmp._playPromptState;
    // eslint-disable-next-line no-underscore-dangle
    const fns = cmp._playPromptFns;

    if (!state || !fns) {
      // eslint-disable-next-line no-console
      console.warn("PlayPrompt not initialized yet");
      return;
    }

    if (!state.f9UserId || !state.lastInteractionId) {
      state.console2.warn(
        "No active/known interaction yet; accept a call first before playing the prompt manually."
      );
      return;
    }

    // Manual button should re-play even if it already played for this interaction.
    fns.playPromptByName(state.promptNamePlayOnConnect, state.f9UserId, state.lastInteractionId, true);
  },
});
