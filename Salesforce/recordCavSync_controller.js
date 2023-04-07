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
  
    // initialize logging variables
    const defaultLoggingMode = "log";
    const allowedLoggingModes = ["error", "warn", "log", "info", "debug"];   

    // log messages to the console with a timestamp and prefix for 
    // easy identification in the browser console
    function logMessage(message, prefix = "[*****]", mode = defaultLoggingMode) { 
      const d = new Date().toLocaleString();
      if (allowedLoggingModes.includes(mode)) {
        console[mode](`${d} ${prefix} ${message}`);
      }
    }

    // initialize f9libLoaded scope variables
    // dictionary to hold the domain CAVs for easy lookup
    let cavsDict = {};
    // tracking variable for the selected record id
    let selectedRecordId = "";

    // update the Salesforce.salesforce_id CAV on the call
    function updateSalesforceIdCAV(recordId) {
      let updateCavList = [
        {
          id: `${cavsDict["Salesforce"]["salesforce_id"]["id"]}`,
          value: recordId,
        },
      ];
      logMessage(`CAV update with cavList: ${JSON.stringify(updateCavList)}`);
      interactionApi.setCav(updateCavList);
      logMessage(`CAV update complete`);
    }

    // register callbacks to the interaction API
    interactionApi.subscribe({

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callStarted: (startedCall) => {
        logMessage(`Call Started ${JSON.stringify(startedCall)}`);
        interactionApi
          .getCav({ interactionId: startedCall.callData.interactionId })
          .then((domainCavs) => {
            domainCavs.forEach((cav) => {
              cavsDict[cav.group] = cavsDict[cav.group] || {};
              cavsDict[cav.group][cav.name] = cavsDict[cav.group][cav.name] || {};
              cavsDict[cav.group][cav.name]["id"] = cav.id;
              cavsDict[cav.group][cav.name]["type"] = cav.type;
              cavsDict[cav.group][cav.name]["restrictions"] = cav.restrictions;
            });
            logMessage(
              `Interaction API got cavList: ${JSON.stringify(cavsDict)}`
            );
          });
      },

      // on call accepted, get the domain CAVs and map to a dictionary for easy lookup
      callAccepted: (acceptedCall) => {
        logMessage(`Call Started ${JSON.stringify(acceptedCall)}`);

      },

      // on object selected, update the CAV
      objectSelected: (selectedObject) => {
        logMessage(`Object Selected ${JSON.stringify(selectedObject)}`);

        let selectedObjectRecordId = selectedObject.crmObject.id || undefined;
        logMessage(`Selected Record Id: ${selectedObjectRecordId}`);
        if(selectedObjectRecordId != undefined) {
          let urlParts = selectedObject.crmObject.metadata.url.split("/");
          logMessage(`URL Parts: ${JSON.stringify(urlParts)}`);
          // for each part of the url, check if it is the record id
          urlParts.forEach((part) => {
            if (part.includes(selectedObjectRecordId)) {
              selectedRecordId = part;
              logMessage(`Found in URL: ${selectedRecordId}`);
            }
          })
        }

        logMessage(`Selected Record Id IS NOW: ${selectedObjectRecordId}`);
        // IMPORTANT - The CAV MUST be on the campaign profile layout
        updateSalesforceIdCAV(selectedRecordId);;
      },

      // call accepted comes after call start event, leaving here in case a future action is needed
      callAccepted: (acceptedCall) => {
        logMessage(`Call Accepted ${JSON.stringify(acceptedCall)}`);
      },
    });

    // register callbacks to the hook API
    hookApi.registerApi({
      // on screen pop, set the selectedRecordId
      afterScreenPop: function (screenPopData) {
        logMessage(`afterScreenPop ${JSON.stringify(screenPopData)}`);
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
        logMessage(`beforeDisposition ${JSON.stringify(dispositionData)}`);
        // get the in-focus record id from the component
        let inFocusRecordId = cmp.get("v.recordId");
        logMessage(`Currently In-Focus Record Id: ${inFocusRecordId}`);
        logMessage(`          Selected Record Id: ${selectedRecordId}`);

        // update the CAVs on the call if mismatch between the current record id and the CAV
        if (selectedRecordId != inFocusRecordId) {
          // obtain confirmation from the agent before proceeding
          logMessage(
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
        logMessage(`No CAV update required`);
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
