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
    f9libLoaded: function (cmp, evt, helper) {
		let authStatus = "True"
        // This customization plays a prompt on connect/Talking
        // The prompt identified must be assigned to a skill that the agent is assigned to

        const hookApi = window.Five9.CrmSdk.hookApi();
        const interactionApi = window.Five9.CrmSdk.interactionApi();

        // uncomment the call types you want to play the prompt on
        const promptPlayOnCallTypes = [
            "AGENT",
            "QUEUE_CALLBACK",
            "MANUAL",
            "INBOUND",
            "OUTBOUND",
            "PREVIEW"
        ];

        const promptNamePlayOnConnect = `QRL`;
        let f9UserId;
        let f9UserName;

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
        const console2 = new consoleLogger();
        console2.log("Customization Loaded")


        // playPrompt function takes a promptId as input and plays the corresponding prompt
        // If replayPrompt is true, the prompt will be played even if it has already been played during the interaction   
        const playPromptById = (f9UserId, currentInteractionId, promptId, replayPrompt = false) => {
            console2.log(`Playing Prompt ${promptId}`)

            // check localstorage to see if the prompt has already been played
            //if (localStorage.getItem(`promptPlayed_${currentInteractionId}`) && !replayPrompt) {
            let playedStatus = localStorage.getItem(`promptPlayed_${currentInteractionId}_${promptId}`)
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
                        console2.log("Prompt Played Result:", result)
                        // add a localstorage variable to indicate that the prompt has been played
                        if (result.status < 300 && result.status >= 200) {
                            localStorage.setItem(`promptPlayed_${currentInteractionId}_${promptId}`, true);
                        }
                    }, function (result) {
                        // reject handler
                        console2.log("Prompt Played FAILED:", result)
                    });
            } else {
                console2.log("Prompt already played")
            }
        }

        // playPromptByName function takes the name of the target prompt as input and retrieves the prompt ID
        // Then, it calls playPrompt with the retrieved prompt ID
        const playPromptByName = (targetPromptName, f9UserId, currentInteractionId) => {
            console2.log(`Attempting to play prompt ${targetPromptName}`)
            console2.log("Getting available prompts")
            interactionApi.executeRestApi(
                {
                    path: `/appsvcs/rs/svc/agents/${f9UserId}/prompts`,
                    method: 'GET',
                    payload: null
                }).then(function (result) {
                    // resolve handler
                    let availablePrompts = JSON.parse(result.response);
                    console2.log("Available Prompts:", availablePrompts)
                    // result will look like this:
                    // [{"id":"222995","name":"QRL","description":"This call may be recorded for quality control and trianing purposes","duration":4141},{"id":"222975","name":"someskill_vm_greeting","description":"hi leave a message","duration":1496}]

                    // find the prompt with the target name by looping through each prompt in the result.response array
                    availablePrompts.forEach((prompt) => {
                        if (prompt.name === targetPromptName) {
                            console2.log(`Found prompt ${targetPromptName} with id ${prompt.id}`)
                            playPromptById(f9UserId, currentInteractionId, prompt.id)
                        }
                    }
                    )
                }, function (result) {
                    // reject handler
                    console2.log("FAILED to get prompts:", result)
                });
        }

        window.Five9.CrmSdk.customComponentsApi().registerCustomComponents({
                    template: `<adt-components>
                    <adt-component location="3rdPartyComp-li-chat-details-top" label="Member Details" style="flex-direction: column">
            <adt-input value="${authStatus}" id="authStatusCustomComponentInput" name="authStatus" label="Auth Status" placeholder="Authentication Status"
                    onchange="callTabInputCallback"></adt-input>
                    </adt-component>                      
                    </adt-components>
                    `,
                    callbacks: {
                    callTabInputCallback: function(params) {
                        debugStream.debug({
                            callee: arguments.callee.name,
                            data: params
                		});
        			}                  
       	 		}
        });
        
        // register callbacks to the interaction API
        interactionApi.subscribe({
            // When a call starts, set the current interaction ID and play the prompt with the specified name      
            callAccepted: (interactionSubscriptionEvent) => {
                const currentInteractionId = interactionSubscriptionEvent.callData.interactionId;
                f9UserId = interactionSubscriptionEvent.callData.agentId;
                f9UserName = interactionSubscriptionEvent.callData.agentName;

                console2.log("Call Accepted:", interactionSubscriptionEvent);
                console2.log(`Current Interaction Id: ${currentInteractionId}`);
                playPromptByName(promptNamePlayOnConnect, f9UserId, currentInteractionId);
            },
            callEnded: (interactionSubscriptionEvent) => {
                console2.log("Call Ended:", interactionSubscriptionEvent);
            },
            chatOffered: (interactionSubscriptionEvent) => {
                const currentInteractionId = interactionSubscriptionEvent.chatData.interactionId;
                f9UserId = interactionSubscriptionEvent.chatData.agentId;
                f9UserName = interactionSubscriptionEvent.chatData.agentName;

                console2.log("Chat Offered:", interactionSubscriptionEvent);
                console2.log(`Current Interaction Id: ${currentInteractionId}`);
            				console2.log('Registering Custom Component ON OFFER')
                
                console2.log("Should be registered DURING OFFER")
            
            },
            chatAccepted: (interactionSubscriptionEvent) => {
                const currentInteractionId = interactionSubscriptionEvent.chatData.interactionId;
                f9UserId = interactionSubscriptionEvent.chatData.agentId;
                f9UserName = interactionSubscriptionEvent.chatData.agentName;

                console2.log("Chat Accepted:", interactionSubscriptionEvent);
                console2.log(`Current Interaction Id: ${currentInteractionId}`);
                // loop through the customFields array and create a new object with the key value pairs
                let customFieldData = {};
                interactionSubscriptionEvent.chatData.customFields.forEach((field) => {
                    customFieldData[field.key] = field.value;
                });
                let authStatus = customFieldData['ChatVariables.authenticated'];
                console2.log(`Auth Status: ${customFieldData['ChatVariables.authenticated']}`)
                
				console2.log('Registering Custom Component')
                window.Five9.CrmSdk.customComponentsApi().registerCustomComponents({
                    template: `<adt-components>
                      <adt-component location="3rdPartyComp-li-chat-details-top" label="Member Details" style="flex-direction: column">
                      <adt-input value="${authStatus}" id="authStatusCustomComponentInput" name="authStatus" label="Auth Status" placeholder="Authentication Status"
                                   onchange="callTabInputCallback"></adt-input>
                      </adt-component>                      
                    </adt-components>
                    `,
                    callbacks: {
                      callTabInputCallback: function(params) {
                        debugStream.debug({
                          callee: arguments.callee.name,
                          data: params
                        });
                      }                  
                    }
                  });
                console2.log("Should be registered")
            },
        });

        // subscribe to WsEvents
        interactionApi.subscribeWsEvent({
            "4": function (payLoad, context) {
                console2.debug("Interaction Updated")
                console2.debug("context:", context)
                console2.debug("payLoad:", payLoad)

                // optional, do something with the interaction data
            }
        });
    },

    doInit: function (cmp, evt, helper) {
        // Retrieve the record information using LDS
        var recordLoader = cmp.find("recordLoader");
        recordLoader.reloadRecord();
    },
});