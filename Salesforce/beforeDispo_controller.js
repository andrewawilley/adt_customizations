({
  f9libLoaded: function (cmp, evt, helper) {
    // a lightning component that uses the Five9 SDK to set the Salesforce record Id that is currently in focus before dispositioning a call
    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    function logMessage(message, prefix = "*******************") {
      var d = new Date();
      var n = d.toLocaleString();
      console.log(`${n} ${prefix} ${message}`);
    }

    let cavsDict = {};

    interactionApi.subscribe({
      // on call accepted, get the domain CAVs
      callAccepted: (callData) => {
        logMessage(`Call Accepted ${JSON.stringify(callData)}`);
      },
      callStarted: params => {
        interactionApi.getCav({ interactionId: params.callData.interactionId })
          .then(domainCavs => {
            // build a dictionary of CAVs by group and name for easy lookup
            domainCavs.forEach((cav) => {
              cavsDict[cav.group] = cavsDict[cav.group] || {};
              cavsDict[cav.group][cav.name] = cavsDict[cav.group][cav.name] || {};
              cavsDict[cav.group][cav.name]["id"] = cav.id;
              cavsDict[cav.group][cav.name]["type"] = cav.type;
              cavsDict[cav.group][cav.name]["restrictions"] = cav.restrictions;
            });
            logMessage(`Interaction API got cavList: ${JSON.stringify(cavsDict)}`);
          });
      }
    });

    hookApi.registerApi({
      beforeDisposition: function (dispositionData) {
        logMessage(`beforeDisposition ${JSON.stringify(dispositionData)}`);

        // get the record id from the component
        var recordId = cmp.get("v.recordId");
        logMessage(`Currently In-Focus Record Id: ${recordId}`);

        // IMPORTANT - The CAV MUST be on the campaign profile layout
        let updateCavList = [
          { id: `${cavsDict["Salesforce"]["salesforce_id"]["id"]}`, value: recordId }
        ]

        logMessage(`Preparing CAV update with cavList: ${JSON.stringify(updateCavList)}`);

        // update the CAVs on the call
        interactionApi.setCav({
          interactionId: dispositionData.interactionData.interactionId,
          cavList: updateCavList
        });

        // obtain confirmation from the agent before proceeding
        return Promise.resolve({
          status: {
            statusCode: Five9.CrmSdk.HookStatusCode.Confirmation,
            message: `Do you weant to associate this call with ${recordId}?`,
            messageHeader: 'Confirmation'
          }
        });
      }
    });
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  }
})