({
  f9libLoaded: function (cmp, evt, helper) {
    // This customization sets the Salesforce.salesforce_id CAV on the call
    // when the agent selects a new related-to record in the adapter and
    // also asks the agent to verify the disposition action if the record
    // selected does not match the record in focus.

    // IMPORTANT - The Salesforce.salesforce_id CAV MUST be on the
    // campaign profile layout or this customization will not work.

    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    let promptPlayed = false;

    let availablePrompts = undefined

    // initialize logging variables
    const defaultLoggingPrefix = "[*****]";
    const allowedLoggingModes = ["warn", "log", "info", "debug"];

    let f9OrgId = undefined;
    let f9UserId = undefined;

    interactionApi
        .getMetadata()
        .then((metadataResponse) => {
        console2.log(`"Metadata Response:\n${JSON.stringify(metadataResponse)}`)
        f9OrgId = metadataResponse.tenantId;
        f9UserId = metadataResponse.agentId;
        console2.log(` OrgId: ${f9OrgId}`);
        console2.log(`UserId: ${f9UserId}`);
    })

    class consoleLogger {
      constructor(prefix = undefined) {
        this.prefix = prefix || defaultLoggingPrefix;

        // for each mode in allowedLoggingModes, create a function
        // that will log the message with the mode
        allowedLoggingModes.forEach((mode) => {
          this[mode] = (message) => {
            const d = new Date();
            console[mode](
              `${this.prefix} (${d.toLocaleString(
                undefined, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false, // use 24-hour time format
                }
              )}) ${message}`
            );
          };
        });
      }
    }

    let console2 = new consoleLogger();




    // register callbacks to the interaction API
    interactionApi.subscribe({

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callAccepted: (acceptedCall) => {
        console2.log(`Call Started ${JSON.stringify(acceptedCall)}`);
        // get the available prompts

      },

    });

    // subscribe to WsEvents
    interactionApi.subscribeWsEvent({
        "4": function (payLoad, context) {
            console2.log("Interaction Updated")
            console2.log(`Context:\n${JSON.stringify(context)}`)
            console2.log(` Params:\n${JSON.stringify(payLoad)}`)
            
        }
    });
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});
