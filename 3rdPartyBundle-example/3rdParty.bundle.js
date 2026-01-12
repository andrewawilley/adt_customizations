define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded");

    let globalAuthStatus = null; // Global variable to store auth status
    let authStatusInterval; // Store the interval ID for the polling loop

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

    loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', async function (Five9Sdk) {
        if (Five9Sdk && Five9Sdk.CrmSdk) {

            const interactionApi = Five9Sdk.CrmSdk.interactionApi();
            const hookApi = Five9Sdk.CrmSdk.hookApi();
            let targetCavId = '';
            let currentInteractionId = '';

            if (interactionApi) {
                interactionApi.subscribe({
                    callStarted: params => {

                        let targetCav = 'Custom.crm_leadid_text'; // Change this to the desired CAV (format: "Group.Name"; Name may contain dots)
                        const [targetCavGroup, targetCavName] = targetCav.split('.');
                        currentInteractionId = params.callData.interactionId
                        console.log(`### Current Call ID Updated: ${currentInteractionId}`)
                        interactionApi.getCav({
                                interactionId: currentInteractionId
                            })
                            .then(cavsResponse => {
                                cavsResponse.forEach((cav) => {
                                    if (cav.group === targetCavGroup && cav.name === targetCavName) {
                                        console.log(`### Found target CAV: group="${targetCavGroup}", name="${targetCavName}"`)
                                        return cav
                                    }
                                    return null;
                                });
                                
                            })
                            .then(match => {
                                if (!match) return;
                                return interactionApi.setCav({
                                    interactionId: currentInteractionId,
                                    cavList: [{ id: match.id, value: currentInteractionId }]
                                }).then(() => {
                                    console.log('### Successfully set CAV value for ID:', match.id)
                                });
                            })
                            .catch(err => {
                                console.error('### Error getting/setting CAV:', err);
                            });
                    }
                });

                // console.log(`### UPDATED Attempting to register hooks`)

                // hookApi.registerApi({

                //     // beforeTransfer: function (params) {
                //     //     console.log(`### beforeTransfer PARAMS:`, params)
                //     //     return Promise.resolve({
                //     //         status: {
                //     //             statusCode: Five9.CrmSdk.HookStatusCode.Confirmation
                //     //         }
                //     //     });
                //     // },

                //     // beforeDisposition: function (params) {
                //     //     console.log(`### beforeDisposition PARAMS:`, params)

                //     //     const targetStatusCode = Five9Sdk.CrmSdk.HookStatusCode.Confirmation;
                //     //     console.log("### The value of the target statuscode is: ", targetStatusCode)
                //     //     return Promise.resolve({
                //     //         status: {
                //     //             statusCode: targetStatusCode,
                //     //             message: `Do you want to proceed?`,
                //     //             messageHeader: "Confirmation",
                //     //         },
                //     //     });
                //     // }
                // });

            } else {
                console.error("#### Interaction API not available");
            }
        } else {
            console.error("#### SDK load failed or CrmSdk is undefined");
        }
    });
});