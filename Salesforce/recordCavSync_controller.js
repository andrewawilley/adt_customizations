({
  f9libLoaded: function (cmp, evt, helper) {
    // This customization sets the Salesforce.salesforce_id CAV on the call
    // when the agent selects a new related-to record in the adapter and
    // also asks the agent to verify the disposition action if the record
    // selected does not match the record in focus.

    // IMPORTANT - CAV MUST be on the campaign profile layout or this
    // they cannot be updated in the customization.


    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

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

    class DomainCAVs {
      constructor(cavList) {
        // this.cavList = cavList;
        cavList.forEach((cav) => {
          this[cav.group] = this[cav.group] || {};
          this[cav.group][cav.name] = cav;
        });
        cons.debug("CAV Definitions:", this);
      }
    }

    // initialize f9libLoaded scope variables
    // dictionary to hold the domain CAVs for easy lookup
    let cavDefinitions = undefined;

    // tracking variable for the selected record id
    let selectedRecordId = "";
    let currentInteractionId = "";

    // update the Salesforce.salesforce_id CAV on the call
    function updateSalesforceIdCAV(salesforceId) {
      let updateCavList = [
        {
          id: cavDefinitions.Salesforce.salesforce_id.id,
          value: salesforceId,
        },
      ];
      cons.log("CAV update with cavList:", updateCavList);
      interactionApi.setCav(
        {
          interactionId: currentInteractionId,
          cavList: updateCavList
        });
      cons.log(`CAV update complete`);
    }

    // register callbacks to the interaction API
    interactionApi.subscribe({

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callStarted: (startedCall) => {
        cons.log("Call Started", startedCall);
        currentInteractionId = startedCall.callData.interactionId;
        interactionApi
          .getCav({ interactionId: startedCall.callData.interactionId })
          .then((domainCavsReturned) => {
            cavDefinitions = new DomainCAVs(domainCavsReturned);
            cons.log("Interaction API got cavList:", cavDefinitions);
          });
      },

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callAccepted: (acceptedCall) => {
        cons.log(`Call Accepted ${JSON.stringify(acceptedCall)}`);

      },

      // on object selected, update the CAV
      objectSelected: (selectedObject) => {
        cons.log("Object Selected:", selectedObject);

        let selectedObjectRecordId = selectedObject.crmObject.id || undefined;
        cons.log("Selected Record Id:", selectedObjectRecordId);
        if (selectedObjectRecordId != undefined) {
          let urlParts = selectedObject.crmObject.metadata.url.split("/");
          // cons.debug("URL Parts:", urlParts);
          // for each part of the url, check if it is the record id
          urlParts.forEach((part) => {
            if (part.includes(selectedObjectRecordId)) {
              selectedRecordId = part;
              cons.log(`Found in URL: ${selectedRecordId}`);
            }
          })
        } else {
          selectedRecordId = "";
        }

        cons.log(`Selected Record Id IS NOW: ${selectedObjectRecordId}`);
        // IMPORTANT - The CAV MUST be on the campaign profile layout
        updateSalesforceIdCAV(selectedRecordId);;
      },

      // call accepted comes after call start event, leaving here in case a future action is needed
      callAccepted: (acceptedCall) => {
        cons.log("Call Accepted:", acceptedCall);
      },
    });

    // register callbacks to the hook API
    hookApi.registerApi({
      // on screen pop, set the selectedRecordId
      afterScreenPop: function (screenPopData) {
        cons.log("afterScreenPop:", screenPopData);
        // if only one screen pop object is returned, set the selected record id and update the CAV
        if (screenPopData.screenPopObjects.length === 1) {
          selectedRecordId = screenPopData.screenPopObjects[0].params.recordId;
          updateSalesforceIdCAV(selectedRecordId);
        }
        return Promise.resolve({
          status: {
            statusCode: Five9.CrmSdk.HookStatusCode.Proceed,
          },
        });
      },

      // on disposition, check if the CAV is set to the correct record id
      // NOTE - it is possible to still have the CAV set to the wrong record id
      //        if the agent disposition timer expires and the call is dispositioned
      beforeDisposition: function (dispositionData) {
        cons.log("beforeDisposition:", dispositionData);
        // get the in-focus record id from the component
        let inFocusRecordId = cmp.get("v.recordId");
        cons.log(`Currently In-Focus Record Id: ${inFocusRecordId}`);
        cons.log(`          Selected Record Id: ${selectedRecordId}`);

        // update the CAVs on the call if mismatch between the current record id and the CAV
        if (selectedRecordId != inFocusRecordId) {
          // obtain confirmation from the agent before proceeding
          cons.log(
            `Selected Record Id: ${selectedRecordId} does not match ${inFocusRecordId}`
          );
          return Promise.resolve({
            status: {
              statusCode: Five9.CrmSdk.HookStatusCode.Confirmation,
              message: `The record selected doesn't match the one in focus (${inFocusRecordId}).  Do you want to proceed?`,
              messageHeader: "Confirmation",
            },
          });
        }
        cons.log(`No CAV update required`);
        return Promise.resolve({
          status: {
            statusCode: Five9.CrmSdk.HookStatusCode.Proceed,
          },
        });
      },
    });
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});
