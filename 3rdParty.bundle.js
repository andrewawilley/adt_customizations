define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded");

    function loadSdkInIframe(url, callback) {
        // Create an iframe element
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none'; // Hide the iframe
        document.body.appendChild(iframe);

        // Wait for the iframe to load before adding the script
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

        // Function to load the script inside the iframe
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

        console.log('#### Setting up Five9 CRM SDK loading in iframe:', url);
        iframe.src = 'about:blank'; // Set the iframe's src to a blank page to ensure it is loaded
    }

    // Usage example
    loadSdkInIframe('https://app.five9.com/dev/sdk/crm/latest/five9.crm.sdk.js', function (Five9Sdk) {
        if (Five9Sdk && Five9Sdk.CrmSdk) {
            console.log('#### SDK loaded from iframe:', Five9Sdk);

            // Access the Interaction API
            const interactionApi = Five9Sdk.CrmSdk.interactionApi();
            if (interactionApi) {
                console.log('#### Interaction API:', interactionApi);

                // Register custom components
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

                // Register interaction API callbacks
                interactionApi.subscribe({
                    chatAccepted: (interactionSubscriptionEvent) => {
                        const authStatus = interactionSubscriptionEvent.chatData.customFields.find(field => field.key === 'ChatVariables.authenticated')?.value;

                        // Locate the chat preview main container and add the auth status label there
                        const chatPreviewContainer = document.getElementById('chat-preview-main-container');
                        
                        if (chatPreviewContainer) {
                            // Check if the auth status indicator is already added to avoid duplicates
                            let authStatusLabel = chatPreviewContainer.querySelector('.auth-status-label');
                            
                            if (!authStatusLabel) {
                                // Create a new div for the auth status
                                authStatusLabel = document.createElement('div');
                                authStatusLabel.classList.add('auth-status-label');
                                authStatusLabel.style.fontWeight = 'bold';
                                authStatusLabel.style.marginTop = '10px';
                    
                                // Insert it just after the "Chat Preview" label
                                const chatPreviewLabel = chatPreviewContainer.querySelector('.view-details label');
                                if (chatPreviewLabel) {
                                    chatPreviewLabel.insertAdjacentElement('afterend', authStatusLabel);
                                }
                            }
                    
                            // Update the auth status text and color
                            authStatusLabel.innerHTML = `Auth Status: ${authStatus ? 'Authenticated' : 'Not Authenticated'}`;
                            authStatusLabel.style.color = authStatus ? 'green' : 'red';
                            console.log("#### Auth status indicator added to chat preview container");
                        } else {
                            console.error("#### Chat preview container not found on page");
                        }
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
