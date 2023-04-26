({
  f9libLoaded: function (cmp, evt, helper) {
    // This customization plays a prompt on connect/Talking
    // The prompt identified must be assigned to a skill that the agent is assigned to

    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    // set the name of the target prompt to play on connect/Talking
    const autoPromptPlayName = "QRL";

    let currentInteractionId = undefined;

    let availablePrompts = undefined
    
    // playPrompt function takes a promptId as input and plays the corresponding prompt
    // If replayPrompt is true, the prompt will be played even if it has already been played during the interaction   
    const playPrompt = (promptId, replayPrompt = false) => {
      cons.log(`Playing Prompt ${promptId}`)

      // check localstorage to see if the prompt has already been played
      //if (localStorage.getItem(`promptPlayed_${currentInteractionId}`) && !replayPrompt) {
      let playedStatus = localStorage.getItem(`promptPlayed_${currentInteractionId}`)
      if (!playedStatus) {
        interactionApi.executeRestApi(
          {
            path: `/appsvcs/rs/svc/agents/${f9UserId}/interactions/calls/${currentInteractionId}/audio/player/play_prompt`,
            method: 'PUT',
            payload: JSON.stringify({
              "value": promptId
            })
          }).then(function (result) {
            // resolve handler
            cons.log("Prompt Played Result:", result)
            // add a localstorage variable to indicate that the prompt has been played
            localStorage.setItem(`promptPlayed_${currentInteractionId}`, true);
          }, function (result) {
            // reject handler
            cons.log("Prompt Played FAILED:", result)
          });
      } else {
        cons.log("Prompt already played")
      }
    }

    // playPromptByName function takes the name of the target prompt as input and retrieves the prompt ID
    // Then, it calls playPrompt with the retrieved prompt ID
    const playPromptByName = (targetPromptName) => {
      cons.log("Getting available prompts")
      interactionApi.executeRestApi(
        {
          path: `/appsvcs/rs/svc/agents/${f9UserId}/prompts`,
          method: 'GET',
          payload: null
        }).then(function (result) {
          // resolve handler
          availablePrompts = JSON.parse(result.response);
          cons.log("Available Prompts:", availablePrompts)
          // result will look like this:
          // [{"id":"222995","name":"QRL","description":"This call may be recorded for quality control and trianing purposes","duration":4141},{"id":"222975","name":"someskill_vm_greeting","description":"hi leave a message","duration":1496}]

          // find the prompt with the target name by looping through each prompt in the result.response array
          availablePrompts.forEach((prompt) => {
            if (prompt.name === targetPromptName) {
              cons.log(`Found prompt ${targetPromptName} with id ${prompt.id}`)
              playPrompt(prompt.id)
            }
          }
          )

        }, function (result) {
          // reject handler
          cons.log("FAILED to get prompts:", result)
        });
    }

    // Custom logging class to add a prefix and timestamp to the console log for easy identification
    // initialize logging variables  
    const defaultLoggingPrefix = "[*****]";
    const allowedLoggingModes = ["error", "warn", "log", "info", "debug"];
    class consoleLogger {
      constructor(prefix = defaultLoggingPrefix) {
        this.prefix = prefix;

        // for each mode in allowedLoggingModes, create a function
        // that will log the message with the mode
        allowedLoggingModes.forEach((mode) => {
          this[mode] = (...messages) => {
            const d = new Date();
            console[mode](
              `${this.prefix} (${d.toLocaleString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false, // use 24-hour time format
              })}) ${messages
                .map((message) => {
                  if (typeof message === "object") {
                    return `\n${JSON.stringify(message)}`;
                  } else {
                    return message;
                  }
                })
                .join(" ")}`
            );
          };
        });
      }
    }
    const cons = new consoleLogger();

    let f9OrgId = undefined;
    let f9UserId = undefined;

    interactionApi
      .getMetadata()
      .then((metadataResponse) => {
        cons.log(`"Metadata Response:\n${JSON.stringify(metadataResponse)}`)
        f9OrgId = metadataResponse.tenantId;
        f9UserId = metadataResponse.agentId;
        cons.log(` OrgId: ${f9OrgId}`);
        cons.log(`UserId: ${f9UserId}`);
      })


    // register callbacks to the interaction API
    interactionApi.subscribe({
      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callAccepted: (interactionSubscriptionEvent) => {
        cons.log("Call Accepted:", interactionSubscriptionEvent);

      },
      // When a call starts, set the current interaction ID and play the prompt with the specified name      
      callStarted: (interactionSubscriptionEvent) => {
        cons.log("Call Started:", interactionSubscriptionEvent);
        currentInteractionId = interactionSubscriptionEvent.callData.interactionId;
        cons.log(`Current Interaction Id: ${currentInteractionId}`)
        // get the available prompts
        interactionApi
        .getMetadata()
        .then((metadataResponse) => {
          cons.log(`"Metadata Response:\n${JSON.stringify(metadataResponse)}`)
          f9OrgId = metadataResponse.tenantId;
          f9UserId = metadataResponse.agentId;
          cons.log(` OrgId: ${f9OrgId}`);
          cons.log(`UserId: ${f9UserId}`);
          playPromptByName(autoPromptPlayName);
        })
      },
      callEnded: (interactionSubscriptionEvent) => {
        cons.log("Call Ended:", interactionSubscriptionEvent);
      }
    });

    // subscribe to WsEvents
    interactionApi.subscribeWsEvent({
      "4": function (payLoad, context) {
        cons.debug("Interaction Updated")
        cons.debug("context:", context)
        cons.debug("context:", payLoad)
      }
    });
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});