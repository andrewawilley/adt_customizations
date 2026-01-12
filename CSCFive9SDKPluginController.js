({
    doInit: function(cmp, evt, helper){
      console.log('CSCFive9SDKPluginController doInit called');
      var action = cmp.get("c.getCurrentUserRoleName");
      action.setCallback(this, function(response) {
          var state = response.getState();
          if (state === "SUCCESS") {
              cmp.set("v.currentUserRole", response.getReturnValue());
          } else {
              // Handle errors
              console.error("Error fetching user role: " + response.getError());
          }
      });
      $A.enqueueAction(action);
      
      var dummyAccConAction = cmp.get("c.getDummyAccountContact");
      dummyAccConAction.setCallback(this, function(response) {
          var state = response.getState();
          if (state === "SUCCESS") {
              var result = response.getReturnValue();
              var splitString = result.split("-");
              cmp.set("v.dummyAccountId", splitString[0]);
              cmp.set("v.dummyContactId", splitString[1]);
          } else {
              // Handle errors
              console.error("Error fetching dummy account/contact: " + response.getError());
          }
      });
      $A.enqueueAction(dummyAccConAction);
    },
    f9libLoaded : function(cmp, evt, helper) {
      const hookApi = window.Five9.CrmSdk.hookApi();
      const interactionApi = window.Five9.CrmSdk.interactionApi();
      const sfNativeApi = window.Five9.CrmSdk.sfNativeApi();
      const crmApi = window.Five9.CrmSdk.crmApi();

      crmApi.registerApi({
        bringAppToFront: () =>{
          console.log('bringAppToFront called from CRM API');
        }
      });

      hookApi.registerApi({
        beforeSaveLog: function(params) {
          console.log('beforeSaveLog', params);
          const newFields = {};

          var caseId = cmp.get("v.caseId");
          var contactId = cmp.get("v.contactId");
          var accountId = cmp.get("v.accountId");
          
          console.log('CaseId: ' + caseId);
          console.log('ContactId: ' + contactId);
          console.log('AccountId: ' + accountId);

          var shortcaseId = '';
          var shortcontactId = '';

          var whatIdAdded = true;
          var whoIdAdded = true;

          var userRoleName = cmp.get("v.currentUserRole");
          console.log('Current User Role Name: ' + userRoleName);

          if(!userRoleName.includes('CGC')){
            if(caseId != null){
              shortcaseId = caseId.substring(0, 15);
              var what = {
                  isWhat: true,
                  isWho: false,
                  type: 'Case',
                  id: shortcaseId,
                  label: 'Case',
                  name: '',
                  customName: null,
                  fields: [],
                  metadata: null,
                  visitedTime: null
              };
              newFields.what = what;
            }else{
              whatIdAdded = false;
            }
          }else{
            if(accountId != null){
              var shortaccountId = accountId.substring(0, 15);
              var what = {
                  isWhat: true,
                  isWho: false,
                  type: 'Account',
                  id: shortaccountId,
                  label: 'Account',
                  name: '',
                  customName: null,
                  fields: [],
                  metadata: null,
                  visitedTime: null
              };
              newFields.what = what;
            }
            else{
              whatIdAdded = false;
            }
          }

          if(contactId != null){
            shortcontactId = contactId.substring(0, 15);
            var who = {
                isWhat: false,
                isWho: true,
                type: 'Contact',
                id: shortcontactId,
                label: 'Contact',
                name: '',
                customName: null,
                fields: [],
                metadata: null,
                visitedTime: null
            };
            newFields.who = who;
          }else{
            whoIdAdded = false;
          }
          
          if(params.interactionData.isTransferredCall && params.interactionLogData.dispositionName == ''){
            newFields.subject = 'Transferred - ' + params.interactionLogData.subject;
            if(!whatIdAdded && !whoIdAdded){
              var dummyAccountId = cmp.get("v.dummyAccountId");
              var dummyContactId = cmp.get("v.dummyContactId");
              dummyAccountId = dummyAccountId.substring(0, 15);
              dummyContactId = dummyContactId.substring(0, 15);
              var what = {
                  isWhat: true,
                  isWho: false,
                  type: 'Account',
                  id: dummyAccountId,
                  label: 'Account',
                  name: '',
                  customName: null,
                  fields: [],
                  metadata: null,
                  visitedTime: null
              };
              newFields.what = what;
              var who = {
                isWhat: false,
                isWho: true,
                type: 'Contact',
                id: dummyContactId,
                label: 'Contact',
                name: '',
                customName: null,
                fields: [],
                metadata: null,
                visitedTime: null
            };
            newFields.who = who;
            }
          }
          var activeCallTabId = cmp.get("v.activeCallTabId");
          if(activeCallTabId != null){
            var workspaceAPI = cmp.find("workspace");
            workspaceAPI.closeTab({tabId: cmp.get("v.activeCallTabId")}).then(function(response) {
              console.log('Active Call Tab: ' + response);
            })
            .catch(function(error) {
              console.log('Error closing Active Call Tab: ' + error);
            });
          }
          var transferCallNum = 0;
          cmp.set("v.TransferCallNum", transferCallNum);
          cmp.set("v.DataPassed", false);
          cmp.set("v.createdTabList", []);
          return Promise.resolve({
            status: { statusCode: Five9.CrmSdk.HookStatusCode.ProceedWithParams },
            newFields
          });
        },
        beforeMakeCall: function(params) {
          console.log('beforeMakeCall', params);

            var statusHookAPI = {};
          if(params.campaignId == '300000000000042' || params.campaignId == '300000000000036'){
            statusHookAPI = { 
              statusCode: Five9.CrmSdk.HookStatusCode.Error,
              message: 'Error! Please select a valid Campaign! Campaign of " - Select A Campaign - (*)" is not valid!',
              messageHeader: 'Error Making Call'
            };
          }
          else{
            statusHookAPI = { statusCode: Five9.CrmSdk.HookStatusCode.Proceed };
          }
          return Promise.resolve({
            status: statusHookAPI
          });
        },
        afterScreenPop: function(params){
          console.log('afterScreenPop', params);
        },
        interactionOpened: function (params){
          console.log('interactionOpened', params);
        }
      });

      interactionApi.subscribe({
        callStarted: function (params) {
          console.log('callStarted', params);

          var interactionId = params.callData.interactionId;
          cmp.set("v.interactionId", interactionId);
          var transferedCall = params.callData.isTransferredCall;
          cmp.set("v.callTransfered", transferedCall);

          try{
            var screenPopResults = sfNativeApi.screenPop(
              {
                type: 'flow', 
                params: {
                  flowDevName: 'CSR_Call_Flow', 
                  flowArgs: [
                    {
                      'name': 'ANI',
                      'type': 'String',
                      'value': params.callData.ani != null ? params.callData.ani : ''
                    },
                    {
                      'name': 'DNIS',
                      'type': 'String',
                      'value': params.callData.dnis != null ? params.callData.dnis : ''
                    },
                    {
                      'name': 'skillId',
                      'type': 'String',
                      'value': params.callData.skillId != null ? params.callData.skillId : ''
                    },
                    {
                      'name': 'skillName',
                      'type': 'String',
                      'value': params.callData.skillName != null ? params.callData.skillName : ''
                    },
                    {
                      'name': 'campaignId',
                      'type': 'String',
                      'value': params.callData.campaignId != null ? params.callData.campaignId : ''
                    },
                    {
                      'name': 'campaignName',
                      'type': 'String',
                      'value': params.callData.campaignName != null ? params.callData.campaignName : ''
                    },
                    {
                      'name': 'callType',
                      'type': 'String',
                      'value': params.callData.callType != null ? params.callData.callType : ''
                    },
                    {
                      'name': 'sessionId',
                      'type': 'String',
                      'value': params.callData.sessionId != null ? params.callData.sessionId : ''
                    },
                    {
                      'name': 'isTransfer',
                      'type': 'Boolean',
                      'value': params.callData.isTransferredCall != null ? params.callData.isTransferredCall : false
                    },
                    {
                      'name': 'interactionId',
                      'type': 'String',
                      'value': params.callData.interactionId != null ? params.callData.interactionId : ''
                    }
                  ]
                }
              }
            );
            console.log('Screen pop results:', screenPopResults);
          } catch (error) {
            console.error('Error during screen pop:', error);
          }
        },
        callAccepted: function (params){
          console.log('callAccepted', params);
          var createdTabs = cmp.get("v.createdTabList");

          if(params.callData.isTransferredCall){
            interactionApi.getSelectedNameObject({
              interactionType: 'Call',
              interactionId: params.callData.interactionId
            }).then(function(nameObject) {
              console.log('Selected Name Object:', nameObject);
              interactionApi.getSelectedRelatedToObject({
                interactionType: 'Call',
                interactionId: params.callData.interactionId
              }).then(function(relatedObject) {
                console.log('Selected Related Object:', relatedObject);
                var workspaceAPI = cmp.find("workspace");
                workspaceAPI.getAllTabInfo().then(function(tabs) {
                  console.log('Tabs: ', tabs);
                  tabs.forEach(function(tab){
                    if(tab.recordId != null){
                      if(tab.recordId.substring(0, 15) === nameObject.id && tab.url.includes('channel=OPEN_CTI')){
                        var matchingTab = false;
                        createdTabs.forEach(function(tabId){
                          if(tabId === tab.tabId){
                            matchingTab = true;
                          }
                        });
                        if(!matchingTab){
                          console.log('Tab Id: ' + tab.tabId + ', Record Id: ' + tab.recordId + ', Focused: ' + tab.focused);
                          workspaceAPI.closeTab({tabId: tab.tabId}).then(function(response) {
                            console.log('Closed Tab Id: ' + tab.tabId + ', Response: ' + response);
                          })
                          .catch(function(error) {
                            console.log('Error closing Tab Id: ' + tab.tabId + ', Error: ' + error);
                          });
                        }
                      }
                      if(tab.recordId.substring(0, 15) === relatedObject.id && tab.url.includes('channel=OPEN_CTI')){
                        var matchingTab = false;
                        createdTabs.forEach(function(tabId){
                          if(tabId === tab.tabId){
                            matchingTab = true;
                          }
                        });
                        if(!matchingTab){
                          console.log('Tab Id: ' + tab.tabId + ', Record Id: ' + tab.recordId + ', Focused: ' + tab.focused); 
                          workspaceAPI.closeTab({tabId: tab.tabId}).then(function(response) {
                            console.log('Closed Tab Id: ' + tab.tabId + ', Response: ' + response);
                          })
                          .catch(function(error) {
                            console.log('Error closing Tab Id: ' + tab.tabId + ', Error: ' + error);
                          });
                        }
                      }
                    }
                  });
                })
                .catch(function(error) {
                  console.log('Error getting tabs: ', error);
                });  
              })
            }).catch(function(error) {
              console.error('Error getting selected Name Object:', error);
            });
          }
        },
        callEnded: function (params){
          console.log('callEnded', params);
          var accountId = cmp.get("v.accountId");
          var caseId = cmp.get("v.caseId");
          var contactId = cmp.get("v.contactId");
          var datapassed = cmp.get("v.DataPassed");
          var userRoleName = cmp.get("v.currentUserRole");

          console.log('DataPassed: ', datapassed);
          console.log('AccountId: ' + accountId);
          console.log('CaseId: ' + caseId);
          console.log('ContactId: ' + contactId);
          console.log('UserRoleName: ' + userRoleName);


          if(!userRoleName.includes('CGC')){
            if(caseId != null){
              var caseId = caseId.substring(0, 15);
              var promise = interactionApi.selectRelatedToObject({
                interactionType: 'Call',
                interactionId: params.callData.interactionId,
                objectId: caseId
              });
              console.log('selectRelatedToObject promise: ', promise);
            }
          }else{
            if(accountId != null){
              var accountId = accountId.substring(0, 15);
              var promise = interactionApi.selectRelatedToObject({
                interactionType: 'Call',
                interactionId: params.callData.interactionId,
                objectId: accountId
              });
              console.log('selectRelatedToObject promise: ', promise);
            }
          }

          if(contactId != null){
            var contactId = contactId.substring(0, 15);
            var promise2 = interactionApi.selectNameObject({
              interactionType: 'Call',
              interactionId: params.callData.interactionId,
              objectId: contactId
            });
            console.log('selectNameObject promise: ', promise2);
          }

          var activeCallTabId = cmp.get("v.activeCallTabId");
          if(activeCallTabId != null && datapassed){
            var workspaceAPI = cmp.find("workspace");
            workspaceAPI.closeTab({tabId: cmp.get("v.activeCallTabId")}).then(function(response) {
              console.log('Active Call Tab: ' + response);
            })
            .catch(function(error) {
              console.log('Error closing Active Call Tab: ' + error);
            });
          }
        }
      });
    },
    handleMessage : function(cmp, message){
      console.log('Message received in CSCFive9SDKPlugin component');

      var transferCallNum = cmp.get("v.TransferCallNum");
      transferCallNum = transferCallNum + 1;
      cmp.set("v.TransferCallNum", transferCallNum);

      var caseId = message.getParam('CaseId');
      var contactId = message.getParam('ContactId');
      var accountId = message.getParam('AccountId');
      var interactionId = message.getParam('InteractionId');
      var tabList = [];

      cmp.set("v.caseId", caseId);
      cmp.set("v.contactId", contactId);
      cmp.set("v.accountId", accountId);
      cmp.set("v.interactionId", interactionId);
      cmp.set("v.DataPassed", true);
      cmp.set("v.createdTabList", tabList);

      console.log('Received message - CaseId: ' + caseId + ', ContactId: ' + contactId + ', AccountId: ' + accountId + ', InteractionId: ' + interactionId);

      var workspaceAPI = cmp.find("workspace");
      workspaceAPI.openTab({
        recordId: accountId,
        focus: true
      }).then(function(tabId){
        console.log('Tab opened with ID: ' + tabId);
        tabList.push(tabId);
        cmp.set("v.createdTabList", tabList);
        if(caseId === undefined || caseId == ''){
          workspaceAPI.openSubtab({
            parentTabId: tabId,
            recordId: contactId,
            focus: true
          }).then(function(subTabId){
            console.log('Subtab opened with ID: ' + subTabId);
            tabList.push(subTabId);
            cmp.set("v.createdTabList", tabList);
            workspaceAPI.focusTab({tabId: tabId}).then(function(response){
              console.log('Focused on Account tab with ID: ' + tabId);
              cmp.set("v.createdTabList", tabList);
            }).catch(function(error){
              console.log('Error focusing on Account tab: ' + error);
            });
          });
        }
        else{
          workspaceAPI.openSubtab({
            parentTabId: tabId,
            recordId: caseId,
            focus: true
          }).then(function(subTabId){
            console.log('Subtab opened with ID: ' + subTabId);
            tabList.push(subTabId);
            cmp.set("v.createdTabList", tabList);
            workspaceAPI.openSubtab({
              parentTabId: tabId,
              recordId: contactId,
              focus: true
            }).then(function(subTabId2){
              console.log('Subtab2 opened with ID: ' + subTabId2);
              tabList.push(subTabId2);
              cmp.set("v.createdTabList", tabList);
              workspaceAPI.focusTab({tabId: tabId}).then(function(response){
                console.log('Focused on Account tab with ID: ' + tabId);
                cmp.set("v.createdTabList", tabList);
              }).catch(function(error){
                console.log('Error focusing on Account tab: ' + error);
              });
            }).catch(function(error){
              console.log('Error opening Contact subtab: ' + error);
            });
          });
        }
      }).catch(function(error){
        console.log('Error opening tab: ' + error);
      });
    },
    handleTransferMessage : function(cmp, messagevar){
      console.log('Transfer Message received in CSCFive9SDKPlugin component');
      var activeCallTabId = messagevar.getParam('ActiveCallTabId');
      var closedCaseBoolean = messagevar.getParam('ClosedCase');
      var transferCallBoolean = messagevar.getParam('IsTransfer');
      console.log('Active Call Tab Id from Message: ', activeCallTabId);
      console.log('Is Transfer Boolean from Message: ', transferCallBoolean);
      console.log('Closed Case Boolean from Message: ', closedCaseBoolean);
      cmp.set("v.activeCallTabId", activeCallTabId);
      var messageChannel = cmp.find('sdkPluginChannel');
      var transferedCall = cmp.get("v.callTransfered");
      var transferCallNum = cmp.get("v.TransferCallNum");
      console.log('Call Transfered Attribute: ', transferedCall);
      if(transferCallBoolean && transferedCall && transferCallNum === 0 && !closedCaseBoolean){

        var payload = {message: 'Start Transfer Process'};
        messageChannel.publish(payload);
        console.log('Published message to CSCFive9CallDataHelperChannel__c to start transfer process.');
      }
    }
})