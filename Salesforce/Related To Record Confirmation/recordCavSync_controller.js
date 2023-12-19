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
    const console2 = new consoleLogger();

    console2.info("Customization loaded.")

    class DomainCAVs {
      constructor(cavList) {
        // this.cavList = cavList;
        cavList.forEach((cav) => {
          this[cav.group] = this[cav.group] || {};
          this[cav.group][cav.name] = cav;
        });
        console2.debug("CAV Definitions:", this);
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
      console2.log("CAV update with cavList:", updateCavList);
      interactionApi.setCav(
        {
          interactionId: currentInteractionId,
          cavList: updateCavList
        });
      console2.log(`CAV update complete`);
    }

    // register callbacks to the interaction API
    interactionApi.subscribe({

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callStarted: (startedCall) => {
        console2.log("Call Started", startedCall);
        currentInteractionId = startedCall.callData.interactionId;
        interactionApi
          .getCav({ interactionId: startedCall.callData.interactionId })
          .then((domainCavsReturned) => {
            cavDefinitions = new DomainCAVs(domainCavsReturned);
            console2.log("Interaction API got cavList:", cavDefinitions);
          });
      },

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callAccepted: (acceptedCall) => {
        console2.log(`Call Accepted ${JSON.stringify(acceptedCall)}`);

      },

      // on object selected, update the CAV
      objectSelected: (selectedObject) => {
        console2.log("Object Selected:", selectedObject);

        let selectedObjectRecordId = selectedObject.crmObject.id || undefined;
        console2.log("Selected Record Id:", selectedObjectRecordId);
        if (selectedObjectRecordId != undefined) {
          let urlParts = selectedObject.crmObject.metadata.url.split("/");
          // console2.debug("URL Parts:", urlParts);
          // for each part of the url, check if it is the record id
          urlParts.forEach((part) => {
            if (part.includes(selectedObjectRecordId)) {
              selectedRecordId = part;
              console2.log(`Found in URL: ${selectedRecordId}`);
            }
          })
        } else {
          selectedRecordId = "";
        }

        console2.log(`Selected Record Id IS NOW: ${selectedObjectRecordId}`);
        // IMPORTANT - The CAV MUST be on the campaign profile layout
        updateSalesforceIdCAV(selectedRecordId);;
      },

      // call accepted comes after call start event, leaving here in case a future action is needed
      callAccepted: (acceptedCall) => {
        console2.log("Call Accepted:", acceptedCall);
      },
    });

    // register callbacks to the hook API
    hookApi.registerApi({
      // on screen pop, set the selectedRecordId
      afterScreenPop: function (screenPopData) {
        console2.log("afterScreenPop:", screenPopData);
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
        console2.log("beforeDisposition:", dispositionData);
        // get the in-focus record id from the component
        let inFocusRecordId = cmp.get("v.recordId");
        console2.log(`Currently In-Focus Record Id: ${inFocusRecordId}`);
        console2.log(`          Selected Record Id: ${selectedRecordId}`);

        // update the CAVs on the call if mismatch between the current record id and the CAV
        if (selectedRecordId != inFocusRecordId) {
          // obtain confirmation from the agent before proceeding
          console2.log(
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
        console2.log(`No CAV update required`);
        return Promise.resolve({
          status: {
            statusCode: Five9.CrmSdk.HookStatusCode.Proceed,
          },
        });
      },
    });

    // subscribe to WsEvents
    interactionApi.subscribeWsEvent({

      // Event 4 is Interaction Updated
      "4": function (payLoad, context) {
        console2.debug("Interaction Updated")
        console2.debug("context:", context)
        console2.debug("context:", payLoad)
      },

      // Event 5 is Interaction Deleted (call ended and dispositioned)
      "5": function (payLoad, context) {
        console2.debug("Interaction Ended and Dispositioned")
        console2.debug("context:", context)
        console2.debug("context:", payLoad)
      },
      
      // 8 - 10 are for Preview events
      "8": function (payLoad, context) {
        console2.debug("Preview Created")
        console2.debug("context:", context)
        console2.debug("context:", payLoad)
      },
      
      "9": function (payLoad, context) {
        console2.debug("Preview Deleted / Declined")
        console2.debug("context:", context)
        console2.debug("context:", payLoad)
      },
      
      "10": function (payLoad, context) {
        console2.debug("Preview Updated")
        console2.debug("context:", context)
        console2.debug("context:", payLoad)
      }
    });
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});
