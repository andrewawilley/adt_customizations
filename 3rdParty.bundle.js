define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded");

    let globalAuthStatus = false; // Global variable to store auth status
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

    function updateAuthStatus() {
        // Escape the ID with backslashes to ensure the selector is valid
        const targetDiv = document.querySelector('#\\33 rdPartyComp-li-chat-details-top .custom-element-component div');
        
        if (targetDiv) {
            targetDiv.innerHTML = `Auth Status: ${globalAuthStatus ? 'Authenticated' : 'Not Authenticated'}`;
            targetDiv.style.color = globalAuthStatus ? 'green' : 'red';
            console.log("#### Auth status updated in dynamic component");
        } else {
            console.warn("#### Target div for Auth Status not found yet");
        }
    }
    

    function startPollingAuthStatus() {
        authStatusInterval = setInterval(() => {
            updateAuthStatus();
        }, 1000); // Poll every 1 second
    }

    loadSdkInIframe('https://app.five9.com/dev/sdk/crm/latest/five9.crm.sdk.js', function (Five9Sdk) {
        if (Five9Sdk && Five9Sdk.CrmSdk) {
            console.log('#### SDK loaded from iframe:', Five9Sdk);

            const interactionApi = Five9Sdk.CrmSdk.interactionApi();
            if (interactionApi) {
                console.log('#### Interaction API:', interactionApi);

                Five9Sdk.CrmSdk.customComponentsApi().registerCustomComponents({
                    template: `<adt-components>
                        <adt-component location="3rdPartyComp-li-chat-details-top" label="Auth Status: " style="flex-direction: column"></adt-component>
                    </adt-components>`,
                    callbacks: {
                        callTabInputCallback: function (params) {
                            console.log('#### Callback - callTabInputCallback:', params);
                        }
                    }
                });

                console.log("#### REGISTERING CALLBACKS");

                startPollingAuthStatus(); // Start polling as soon as the SDK is loaded

                interactionApi.subscribe({
                    chatAccepted: (interactionSubscriptionEvent) => {
                        globalAuthStatus = interactionSubscriptionEvent.chatData.customFields.find(field => field.key === 'chatTrackingVariables.authStatus')?.value;
                        console.log("#### Updated global auth status:", globalAuthStatus);
                    },
                    chatOffered: (interactionSubscriptionEvent) => {
                        console.log("#### Chat Offered:", interactionSubscriptionEvent);
                    }
                });

            } else {
                console.error("#### Interaction API not available");
            }
        } else {
            console.error("#### SDK load failed or CrmSdk is undefined");
        }
    });

});
