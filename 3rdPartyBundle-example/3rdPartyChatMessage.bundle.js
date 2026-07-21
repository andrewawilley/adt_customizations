define('3rdparty.bundle', [], function () {

    console.log("#### 3rdPartyChatMessage.bundle.js loaded");

    // WS event id that fires when an agent receives an internal chat (IM) message
    // from a supervisor or another agent.
    const CHAT_MESSAGE_EVENT = '10003';

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

    // ------------------------------------------------------------------
    // Non-blocking toast notification (replaces the blocking alert()).
    // Renders a small stack of dismissible cards in the top-right corner.
    // Because it is DOM-based it never halts other JavaScript execution.
    // ------------------------------------------------------------------
    const Toast = (function () {
        let container = null;

        const ensureContainer = () => {
            if (container && document.body.contains(container)) {
                return container;
            }
            container = document.createElement('div');
            container.id = 'f9-chat-toast-container';
            Object.assign(container.style, {
                position: 'fixed',
                top: '16px',
                right: '16px',
                zIndex: '2147483647',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxWidth: '360px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                pointerEvents: 'none',
            });
            document.body.appendChild(container);
            return container;
        };

        // options: { title, body, timeoutMs }
        const show = ({ title = '', body = '', timeoutMs = 8000 } = {}) => {
            const root = ensureContainer();

            const card = document.createElement('div');
            Object.assign(card.style, {
                pointerEvents: 'auto',
                background: '#1c2b39',
                color: '#ffffff',
                borderLeft: '4px solid #4c9aff',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                padding: '12px 14px',
                opacity: '0',
                transform: 'translateX(20px)',
                transition: 'opacity 0.2s ease, transform 0.2s ease',
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: body ? '6px' : '0',
            });

            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            Object.assign(titleEl.style, { fontWeight: 'bold', fontSize: '13px' });

            const closeEl = document.createElement('span');
            closeEl.textContent = '\u00d7';
            Object.assign(closeEl.style, {
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: '14px',
                marginLeft: '12px',
                opacity: '0.8',
            });

            const bodyEl = document.createElement('div');
            bodyEl.textContent = body;
            Object.assign(bodyEl.style, { fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' });

            header.appendChild(titleEl);
            header.appendChild(closeEl);
            card.appendChild(header);
            if (body) card.appendChild(bodyEl);
            root.appendChild(card);

            // animate in
            requestAnimationFrame(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateX(0)';
            });

            let dismissTimer = null;
            const dismiss = () => {
                if (dismissTimer) clearTimeout(dismissTimer);
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                setTimeout(() => card.remove(), 200);
            };

            closeEl.addEventListener('click', dismiss);
            if (timeoutMs > 0) {
                dismissTimer = setTimeout(dismiss, timeoutMs);
            }

            return dismiss;
        };

        return { show };
    })();

    loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', async function (Five9Sdk) {
        if (!Five9Sdk || !Five9Sdk.CrmSdk) {
            console.error("#### SDK load failed or CrmSdk is undefined");
            return;
        }

        const interactionApi = Five9Sdk.CrmSdk.interactionApi();

        if (!interactionApi) {
            console.error("#### Interaction API not available");
            return;
        }

        // ------------------------------------------------------------------
        // Agent REST API helpers.
        // These reuse the interactionApi.executeRestApi(...) transport
        // (same as the PlayPrompt and SetCAV samples) to resolve org id and
        // look up user/agent display info by id.
        // ------------------------------------------------------------------
        let cachedOrgId = null;
        let cachedUsersById = null; // Map<string userId, userObject>
        let usersFetchPromise = null;

        // Resolve orgId from auth metadata (same approach as 3rdPartySetCAV.bundle.js)
        const getOrgId = async () => {
            if (cachedOrgId) return cachedOrgId;
            try {
                const res = await interactionApi.executeRestApi({
                    path: '/appsvcs/rs/svc/auth/metadata',
                    method: 'GET',
                    payload: null,
                });
                let meta = null;
                try {
                    meta = JSON.parse(res.response || 'null');
                } catch (e) {
                    console.error('#### Failed to parse auth/metadata response', e, res);
                }
                cachedOrgId = meta?.orgId || meta?.org?.id || meta?.organizationId || null;
                if (!cachedOrgId) {
                    console.warn('#### auth/metadata did not include orgId; response:', meta);
                }
                return cachedOrgId;
            } catch (e) {
                console.error('#### Error calling auth/metadata:', e);
                return null;
            }
        };

        // Fetch all users/agents for the org and index them by id.
        // NOTE: verify this path against your org's Agent REST API reference;
        // the users collection is exposed under the org resource.
        const loadUsers = async () => {
            if (cachedUsersById) return cachedUsersById;
            if (usersFetchPromise) return usersFetchPromise;

            usersFetchPromise = (async () => {
                const orgId = await getOrgId();
                if (!orgId) return null;
                try {
                    const res = await interactionApi.executeRestApi({
                        path: `/appsvcs/rs/svc/orgs/${orgId}/users`,
                        method: 'GET',
                        payload: null,
                    });
                    let users = [];
                    try {
                        users = JSON.parse(res.response || '[]');
                    } catch (e) {
                        console.error('#### Failed to parse users response', e, res);
                        return null;
                    }
                    if (!Array.isArray(users)) {
                        console.warn('#### users response is not an array:', users);
                        return null;
                    }
                    const map = new Map();
                    users.forEach((u) => {
                        if (u && u.id != null) map.set(String(u.id), u);
                    });
                    cachedUsersById = map;
                    console.log(`#### Loaded ${map.size} user(s) from Agent REST API`);
                    return cachedUsersById;
                } catch (e) {
                    console.error('#### Error fetching org users:', e);
                    return null;
                } finally {
                    usersFetchPromise = null;
                }
            })();

            return usersFetchPromise;
        };

        // Return a friendly display object for a given user id.
        const getUserInfo = async (userId) => {
            const id = String(userId || '');
            if (!id) return null;
            const users = await loadUsers();
            const user = users ? users.get(id) : null;
            if (!user) {
                return { id, displayName: id, found: false };
            }
            const displayName =
                user.fullName ||
                user.displayName ||
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                user.userName ||
                user.name ||
                id;
            return {
                id,
                displayName,
                userName: user.userName || user.name || '',
                email: user.email || user.EMail || '',
                found: true,
                raw: user,
            };
        };

        // Resolve the current agent id so we can ignore our own outbound echoes.
        let currentUserId = '';
        try {
            const agentInfo = await interactionApi.getAgentInfo?.();
            currentUserId = String(agentInfo?.id || agentInfo?.userId || '');
            console.log('#### Current agent id:', currentUserId || '(unknown)');
        } catch (e) {
            console.warn('#### Could not resolve current agent id:', e);
        }

        // Warm the user cache so the first notification resolves quickly.
        loadUsers();

        // Simple in-memory guard so we do not process the same chat message twice.
        const handledMessageIds = new Set();

        const handleChatMessage = async (payLoad, context) => {
            try {
                if (!payLoad || payLoad.type !== 'im') {
                    return;
                }

                const messageId = payLoad.id || payLoad.guuid;
                if (messageId && handledMessageIds.has(messageId)) {
                    return;
                }
                if (messageId) {
                    handledMessageIds.add(messageId);
                }

                const senderId = String(payLoad.senderId || payLoad.originatorId || '');
                const isFromMe = currentUserId && senderId === currentUserId;

                // Ignore the echo of messages this agent sent themselves.
                if (isFromMe) {
                    console.debug('#### Ignoring outbound chat message echo:', messageId);
                    return;
                }

                // Recipients are everyone in the conversation except the sender.
                const participantIds = Array.isArray(payLoad.users) ? payLoad.users.map(String) : [];
                const recipientIds = participantIds.filter((uid) => uid && uid !== senderId);

                // Look up sender + recipient details via the Agent REST API.
                const [senderInfo, ...recipientInfos] = await Promise.all([
                    getUserInfo(senderId),
                    ...recipientIds.map((uid) => getUserInfo(uid)),
                ]);

                const info = {
                    messageId,
                    sender: senderInfo,
                    recipients: recipientInfos,
                    message: payLoad.message,
                    broadcast: context?.broadCast === true,
                    participants: participantIds,
                    receivedAt: payLoad.messageDate,
                };

                console.log('#### Internal chat message received:', info);

                // --- Proof of concept reaction (non-blocking toast) ---
                // Replace Toast.show(...) with whatever behavior you need, e.g.
                // screen-pop a record, post to a CRM activity, etc.
                const fromLabel = info.broadcast
                    ? 'Broadcast'
                    : (senderInfo?.displayName || senderId || 'Unknown');
                const toLabel = recipientInfos.length
                    ? recipientInfos.map((r) => r?.displayName || r?.id).join(', ')
                    : 'You';

                Toast.show({
                    title: `New chat from ${fromLabel}`,
                    body: `To: ${toLabel}\n\n${payLoad.message || ''}`,
                    timeoutMs: 10000,
                });
            } catch (e) {
                console.error('#### Error handling chat message event:', e);
            }
        };

        interactionApi.subscribeWsEvent({
            [CHAT_MESSAGE_EVENT]: function (payLoad, context) {
                console.debug('#### WS event 10003 received (internal chat message)');
                console.debug('#### context:', context);
                console.debug('#### payLoad:', payLoad);
                // handleChatMessage is async; fire-and-forget so we never block the SDK.
                handleChatMessage(payLoad, context);
            },
        });

        console.log(`#### Subscribed to WS event ${CHAT_MESSAGE_EVENT} for internal chat messages`);
    });
});
