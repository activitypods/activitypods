var $fvx3m$reactjsxruntime = require("react/jsx-runtime");
var $fvx3m$react = require("react");
var $fvx3m$reactadmin = require("react-admin");
var $fvx3m$muimaterial = require("@mui/material");
var $fvx3m$muiiconsmaterialError = require("@mui/icons-material/Error");
var $fvx3m$semappsactivitypubcomponents = require("@semapps/activitypub-components");
var $fvx3m$urljoin = require("url-join");
var $fvx3m$httplinkheader = require("http-link-header");
var $fvx3m$jwtdecode = require("jwt-decode");
var $fvx3m$reactrouterdom = require("react-router-dom");
var $fvx3m$muiiconsmaterialLock = require("@mui/icons-material/Lock");
var $fvx3m$muiiconsmaterialStorage = require("@mui/icons-material/Storage");
var $fvx3m$semappssemanticdataprovider = require("@semapps/semantic-data-provider");
var $fvx3m$muiiconsmaterialShare = require("@mui/icons-material/Share");
var $fvx3m$muistylesmakeStyles = require("@mui/styles/makeStyles");
var $fvx3m$muiiconsmaterialGroup = require("@mui/icons-material/Group");
var $fvx3m$muiiconsmaterialPeopleAlt = require("@mui/icons-material/PeopleAlt");
var $fvx3m$muiiconsmaterialApps = require("@mui/icons-material/Apps");
var $fvx3m$muiiconsmaterialSettings = require("@mui/icons-material/Settings");


function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "BackgroundChecks", () => $88874b19fd1a9965$export$2e2bcd8739ae039);
$parcel$export(module.exports, "LoginPage", () => $8c4e86009f42299d$export$2e2bcd8739ae039);
$parcel$export(module.exports, "RedirectPage", () => $691cae6a20c06149$export$2e2bcd8739ae039);
$parcel$export(module.exports, "ShareButton", () => $c30b6e8e8f4f1d51$export$2e2bcd8739ae039);
$parcel$export(module.exports, "ShareDialog", () => $8ffb7dd40d703ae5$export$2e2bcd8739ae039);
$parcel$export(module.exports, "SyncUserLocale", () => $418040ff16c1a946$export$2e2bcd8739ae039);
$parcel$export(module.exports, "UserMenu", () => $fc1368eec161415d$export$2e2bcd8739ae039);
$parcel$export(module.exports, "englishMessages", () => $4b1314efa6ba34c8$export$2e2bcd8739ae039);
$parcel$export(module.exports, "frenchMessages", () => $7955e6b2ad1a54ef$export$2e2bcd8739ae039);
// Components






const $f21bc75053423cc3$export$1b2abdd92765429 = (uri)=>{
    const url = new URL(uri);
    const username = url.pathname.split("/")[1];
    return "@" + username + "@" + url.host;
};
const $f21bc75053423cc3$export$e57ff0f701c44363 = (value)=>{
    // If the field is null-ish, we suppose there are no values.
    if (!value) return [];
    // Return as is.
    if (Array.isArray(value)) return value;
    // Single value is made an array.
    return [
        value
    ];
};
const $f21bc75053423cc3$export$1391212d75b2ee65 = (t)=>new Promise((resolve)=>setTimeout(resolve, t));
const $f21bc75053423cc3$export$bab98af026af71ac = (value)=>typeof value === "string" && value.startsWith("http") && !/\s/g.test(value);
const $f21bc75053423cc3$export$50ae7fb6f87de989 = (value)=>typeof value === "string" && value.startsWith("/") && !/\s/g.test(value);





const $c6f5b9530195abb8$var$useGetAppStatus = ()=>{
    const { data: identity } = (0, $fvx3m$reactadmin.useGetIdentity)();
    return (0, $fvx3m$react.useCallback)(async ()=>{
        const oidcIssuer = new URL(identity?.id).origin;
        const endpointUrl = (0, ($parcel$interopDefault($fvx3m$urljoin)))(oidcIssuer, ".well-known/app-status");
        const token = localStorage.getItem("token");
        // Don't use dataProvider.fetch as it would go through the proxy
        const response = await fetch(endpointUrl, {
            headers: new Headers({
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            })
        });
        if (response.ok) return await response.json();
        else throw new Error(`Unable to fetch app status. Error ${response.status} (${response.statusText})`);
    }, [
        identity
    ]);
};
var $c6f5b9530195abb8$export$2e2bcd8739ae039 = $c6f5b9530195abb8$var$useGetAppStatus;





/**
 * Return a function that look if an app (clientId) is registered with an user (webId)
 * If not, it redirects to the endpoint provided by the user's authorization agent
 * See https://solid.github.io/data-interoperability-panel/specification/#authorization-agent
 */ const $9a8d0fd57dda054c$var$useRegisterApp = ()=>{
    const dataProvider = (0, $fvx3m$reactadmin.useDataProvider)();
    const registerApp = (0, $fvx3m$react.useCallback)(async (clientId, webId)=>{
        const { json: actor } = await dataProvider.fetch(webId);
        const authAgentUri = actor["interop:hasAuthorizationAgent"];
        if (authAgentUri) {
            // Find if an application registration is linked to this user
            // See https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery
            const { headers: headers, json: authAgent } = await dataProvider.fetch(authAgentUri);
            const linkHeader = (0, ($parcel$interopDefault($fvx3m$httplinkheader))).parse(headers.get("Link"));
            const registeredAgentLinkHeader = linkHeader.rel("http://www.w3.org/ns/solid/interop#registeredAgent");
            if (registeredAgentLinkHeader.length > 0) {
                const appRegistrationUri = registeredAgentLinkHeader[0].anchor;
                return appRegistrationUri;
            } else {
                // Save current path, so that the BackgroundChecks component may redirect there after registration
                localStorage.setItem("redirect", window.location.pathname);
                // No application registration found, redirect to the authorization agent
                const redirectToAuthAgentUrl = new URL(authAgent["interop:hasAuthorizationRedirectEndpoint"]);
                redirectToAuthAgentUrl.searchParams.append("client_id", clientId);
                window.location.href = redirectToAuthAgentUrl.toString();
            }
        } else throw new Error(`apods.error.user_authorization_agent_not_found`);
    }, [
        dataProvider
    ]);
    return registerApp;
};
var $9a8d0fd57dda054c$export$2e2bcd8739ae039 = $9a8d0fd57dda054c$var$useRegisterApp;


/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline or not installed, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 * If the app is not listening to the provided URLs, display an error message
 * Check this every 2 minutes or whenever the window becomes visible again
 */ const $88874b19fd1a9965$var$BackgroundChecks = ({ clientId: clientId, listeningTo: listeningTo = [], children: children })=>{
    const { data: identity, isLoading: isIdentityLoading } = (0, $fvx3m$reactadmin.useGetIdentity)();
    const dataProvider = (0, $fvx3m$reactadmin.useDataProvider)();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    const logout = (0, $fvx3m$reactadmin.useLogout)();
    const [appStatusChecked, setAppStatusChecked] = (0, $fvx3m$react.useState)(false);
    const [errorMessage, setErrorMessage] = (0, $fvx3m$react.useState)();
    const nodeinfo = (0, $fvx3m$semappsactivitypubcomponents.useNodeinfo)(identity?.id ? new URL(identity?.id).host : undefined);
    const registerApp = (0, $9a8d0fd57dda054c$export$2e2bcd8739ae039)();
    const getAppStatus = (0, $c6f5b9530195abb8$export$2e2bcd8739ae039)();
    const redirect = (0, $fvx3m$reactadmin.useRedirect)();
    const isLoggedOut = !isIdentityLoading && !identity?.id;
    if (!clientId) throw new Error(`Missing clientId prop for BackgroundChecks component`);
    const checkAppStatus = (0, $fvx3m$react.useCallback)(async ()=>{
        // Only proceed if the tab is visible
        if (!document.hidden && identity?.id) try {
            let appStatus = await getAppStatus();
            if (appStatus) {
                if (!appStatus.onlineBackend) {
                    setErrorMessage(translate("apods.error.app_offline"));
                    return;
                }
                if (!appStatus.installed) {
                    await registerApp(clientId, identity.id);
                    return;
                }
                if (appStatus.upgradeNeeded) {
                    const { json: actor } = await dataProvider.fetch(identity.id);
                    const { json: authAgent } = await dataProvider.fetch(actor["interop:hasAuthorizationAgent"]);
                    const redirectUrl = new URL(authAgent["interop:hasAuthorizationRedirectEndpoint"]);
                    redirectUrl.searchParams.append("client_id", clientId);
                    window.location.href = redirectUrl.toString();
                    return;
                }
                if (listeningTo.length > 0) {
                    let numAttempts = 0, missingListener;
                    do {
                        missingListener = undefined;
                        for (const uri of listeningTo)if (!(0, $f21bc75053423cc3$export$e57ff0f701c44363)(appStatus.webhookChannels).some((c)=>c.topic === uri)) missingListener = uri;
                        // If one or more listener were not found, wait 1s and refetch the app status endpoint
                        // This happens when the app was just registered, and the webhooks have not been created yet
                        if (missingListener) {
                            numAttempts++;
                            await (0, $f21bc75053423cc3$export$1391212d75b2ee65)(1000);
                            appStatus = await getAppStatus();
                        }
                    }while (missingListener && numAttempts < 10);
                    if (missingListener) {
                        setErrorMessage(translate("apods.error.app_not_listening", {
                            uri: missingListener
                        }));
                        return;
                    }
                }
                setAppStatusChecked(true);
            }
        } catch (e) {
            console.error(e);
            setErrorMessage(translate("apods.error.app_status_unavailable"));
        }
    }, [
        identity,
        nodeinfo,
        getAppStatus,
        setAppStatusChecked,
        document,
        dataProvider,
        setErrorMessage,
        translate,
        registerApp,
        clientId
    ]);
    (0, $fvx3m$react.useEffect)(()=>{
        if (identity?.id && nodeinfo) {
            checkAppStatus();
            const timerId = setInterval(checkAppStatus, 120000);
            return ()=>clearInterval(timerId);
        }
    }, [
        identity,
        nodeinfo,
        checkAppStatus
    ]);
    (0, $fvx3m$react.useEffect)(()=>{
        const redirectUrl = localStorage.getItem("redirect");
        if (redirectUrl) {
            localStorage.removeItem("redirect");
            redirect(redirectUrl);
        }
    }, [
        redirect
    ]);
    (0, $fvx3m$react.useLayoutEffect)(()=>{
        document.addEventListener("visibilitychange", checkAppStatus);
        return ()=>document.removeEventListener("visibilitychange", checkAppStatus);
    }, [
        checkAppStatus
    ]);
    if (isLoggedOut || appStatusChecked) return children;
    else if (errorMessage) return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        sx: {
            minHeight: 400
        },
        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.Box), {
            sx: {
                backgroundColor: "red",
                p: 2,
                textAlign: "center"
            },
            children: [
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialError))), {
                    sx: {
                        width: 50,
                        height: 50,
                        color: "white"
                    }
                }),
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Typography), {
                    color: "white",
                    children: errorMessage
                }),
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Button), {
                    variant: "contained",
                    color: "error",
                    sx: {
                        mt: 2,
                        mr: 1
                    },
                    onClick: ()=>{
                        setErrorMessage(undefined);
                        checkAppStatus();
                    },
                    children: translate("ra.action.refresh")
                }),
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Button), {
                    variant: "contained",
                    color: "error",
                    sx: {
                        mt: 2
                    },
                    onClick: ()=>logout(),
                    children: translate("ra.auth.logout")
                })
            ]
        })
    });
    else // TODO wait 3s before display loader
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        sx: {
            minHeight: 400
        },
        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.CircularProgress), {
            size: 100,
            thickness: 6,
            sx: {
                mb: 5,
                color: "white"
            }
        })
    });
};
var $88874b19fd1a9965$export$2e2bcd8739ae039 = $88874b19fd1a9965$var$BackgroundChecks;












/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */ const $8c4e86009f42299d$var$LoginPage = ({ text: text, clientId: clientId, customPodProviders: customPodProviders })=>{
    const notify = (0, $fvx3m$reactadmin.useNotify)();
    const [searchParams] = (0, $fvx3m$reactrouterdom.useSearchParams)();
    const [locale] = (0, $fvx3m$reactadmin.useLocaleState)();
    const login = (0, $fvx3m$reactadmin.useLogin)();
    const logout = (0, $fvx3m$reactadmin.useLogout)();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    const redirect = (0, $fvx3m$reactadmin.useRedirect)();
    const { data: identity, isLoading: isIdentityLoading } = (0, $fvx3m$reactadmin.useGetIdentity)();
    const [podProviders, setPodProviders] = (0, $fvx3m$react.useState)(customPodProviders || []);
    const [isRegistered, setIsRegistered] = (0, $fvx3m$react.useState)(false);
    const isSignup = searchParams.has("signup");
    const redirectUrl = (0, $f21bc75053423cc3$export$50ae7fb6f87de989)(searchParams.get("redirect")) ? searchParams.get("redirect") : "/";
    const registerApp = (0, $9a8d0fd57dda054c$export$2e2bcd8739ae039)();
    (0, $fvx3m$react.useEffect)(()=>{
        (async ()=>{
            if (podProviders.length < 1) {
                const results = await fetch("https://activitypods.org/data/pod-providers", {
                    headers: {
                        Accept: "application/ld+json"
                    }
                });
                if (results.ok) {
                    const json = await results.json();
                    // Filter POD providers by available locales
                    const podProviders = json["ldp:contains"].filter((provider)=>Array.isArray(provider["apods:locales"]) ? provider["apods:locales"].includes(locale) : provider["apods:locales"] === locale);
                    setPodProviders(podProviders);
                } else notify("auth.message.pod_providers_not_loaded", {
                    type: "error"
                });
            }
        })();
    }, [
        podProviders,
        setPodProviders,
        notify,
        locale
    ]);
    (0, $fvx3m$react.useEffect)(()=>{
        if (searchParams.has("iss")) // Automatically login if Pod provider is known
        login({
            issuer: searchParams.get("iss"),
            redirect: redirectUrl
        });
        else if (searchParams.has("register_app")) {
            // Identity is not available yet because we can't fetch the user profile
            // So get the webId by decoding the token
            const token = localStorage.getItem("token");
            if (token) {
                const payload = (0, ($parcel$interopDefault($fvx3m$jwtdecode)))(token);
                registerApp(clientId, payload?.webid).then((appRegistrationUri)=>{
                    if (appRegistrationUri) setIsRegistered(true);
                }).catch((error)=>{
                    notify(error.message, {
                        type: "error"
                    });
                });
            }
        } else if (searchParams.has("logout")) // Immediately logout if required
        logout({
            redirectUrl: redirectUrl
        });
    }, [
        searchParams,
        login,
        registerApp,
        clientId,
        setIsRegistered,
        notify,
        logout,
        redirectUrl
    ]);
    (0, $fvx3m$react.useEffect)(()=>{
        if (!isIdentityLoading && identity?.id && isRegistered) redirect(redirectUrl);
    }, [
        identity,
        isIdentityLoading,
        isRegistered,
        redirect,
        redirectUrl
    ]);
    if (isIdentityLoading) return null;
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.Card), {
            sx: {
                minWidth: 300,
                maxWidth: 350,
                marginTop: "6em"
            },
            children: [
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
                    sx: {
                        margin: "1em",
                        display: "flex",
                        justifyContent: "center"
                    },
                    children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Avatar), {
                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialLock))), {})
                    })
                }),
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
                    pl: 2,
                    pr: 2,
                    children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Typography), {
                        variant: "body2",
                        sx: {
                            textAlign: "center",
                            padding: "4px 8px 8px"
                        },
                        children: text || translate("auth.message.choose_pod_provider")
                    })
                }),
                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
                    m: 2,
                    children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.List), {
                        sx: {
                            paddingTop: 0,
                            paddingBottom: 0
                        },
                        children: podProviders.map((podProvider, i)=>/*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$react.Fragment), {
                                children: [
                                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Divider), {}),
                                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItem), {
                                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.ListItemButton), {
                                            onClick: ()=>login({
                                                    issuer: podProvider["apods:baseUrl"],
                                                    redirect: redirectUrl,
                                                    isSignup: isSignup
                                                }),
                                            children: [
                                                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemAvatar), {
                                                    children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Avatar), {
                                                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialStorage))), {})
                                                    })
                                                }),
                                                /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                                                    primary: new URL(podProvider["apods:baseUrl"]).host,
                                                    secondary: podProvider["apods:area"]
                                                })
                                            ]
                                        })
                                    })
                                ]
                            }, i))
                    })
                })
            ]
        })
    });
};
var $8c4e86009f42299d$export$2e2bcd8739ae039 = $8c4e86009f42299d$var$LoginPage;





/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 * This page is called from the data browser in the Pod provider
 */ const $691cae6a20c06149$var$RedirectPage = ()=>{
    const config = (0, $fvx3m$semappssemanticdataprovider.useDataProviderConfig)();
    const navigate = (0, $fvx3m$reactrouterdom.useNavigate)();
    const [searchParams] = (0, $fvx3m$reactrouterdom.useSearchParams)();
    (0, $fvx3m$react.useEffect)(()=>{
        if (config) {
            const { ontologies: ontologies, resources: resources } = config;
            let resourceId;
            if (searchParams.has("type")) {
                const fullTypeUri = (0, $fvx3m$semappssemanticdataprovider.getUriFromPrefix)(searchParams.get("type"), ontologies);
                resourceId = Object.keys(resources).find((key)=>resources[key].types?.includes(fullTypeUri));
            }
            if (searchParams.has("uri") && resourceId) navigate(`/${resourceId}/${encodeURIComponent(searchParams.get("uri"))}${searchParams.get("mode") === "show" ? "/show" : ""}`);
            else if (resourceId) navigate(`/${resourceId}`);
            else navigate("/");
        }
    }, [
        config,
        searchParams,
        navigate
    ]);
    return null;
};
var $691cae6a20c06149$export$2e2bcd8739ae039 = $691cae6a20c06149$var$RedirectPage;
























/**
 * @typedef {import("./GroupContactsItem").InvitationState} InvitationState
 */ const $86676b500f2a011a$var$useStyles = (0, ($parcel$interopDefault($fvx3m$muistylesmakeStyles)))((theme)=>({
        listItem: {
            paddingLeft: 0,
            paddingRight: 0
        },
        primaryText: {
            width: "30%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexBasis: "100%"
        },
        secondaryText: {
            textAlign: "center",
            width: "60%",
            fontStyle: "italic",
            color: "grey"
        },
        avatarItem: {
            minWidth: 50
        },
        avatar: {
            backgroundImage: `radial-gradient(circle at 50% 3em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
        }
    }));
/**
 * @param {Object} props
 * @param {import("react-admin").Record} props.record
 * @param {InvitationState} [props.invitation]
 * @param {(invitations: Record<string, InvitationState>) => void} props.onChange
 * @param {boolean} props.isCreator
 */ const $86676b500f2a011a$var$ContactItem = ({ record: record, invitation: invitation, onChange: onChange, isCreator: isCreator })=>{
    const classes = $86676b500f2a011a$var$useStyles();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    // The invitation may still be undefined. In that case, create a default one.
    // TODO: Maybe, this should be handled in the ShareDialog instead?
    const invitationState = invitation || {
        canView: false,
        canShare: false,
        viewReadonly: false,
        shareReadonly: !isCreator
    };
    const changeCanView = ()=>{
        const newViewState = !invitationState.canView;
        onChange({
            [record.describes]: {
                ...invitationState,
                canView: newViewState,
                // Set to false, if the user can't view the record anymore.
                canShare: newViewState && invitationState.canShare
            }
        });
    };
    const changeCanShare = ()=>{
        const newShareState = !invitationState.canShare;
        onChange({
            [record.describes]: {
                ...invitationState,
                canShare: newShareState,
                // Set to true, if the user can share the record.
                canView: newShareState || invitationState.canView
            }
        });
    };
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.ListItem), {
        className: classes.listItem,
        children: [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemAvatar), {
                className: classes.avatarItem,
                children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Avatar), {
                    src: record?.["vcard:photo"],
                    className: classes.avatar,
                    children: record["vcard:given-name"]?.[0]
                })
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.primaryText,
                primary: record["vcard:given-name"],
                secondary: (0, $f21bc75053423cc3$export$1b2abdd92765429)(record.describes)
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.view"),
                secondary: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Switch), {
                    size: "small",
                    checked: invitationState.canView || invitationState.canShare,
                    disabled: invitationState.viewReadonly,
                    onClick: changeCanView
                })
            }),
            isCreator && /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.share"),
                secondary: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Switch), {
                    size: "small",
                    checked: invitationState.canShare,
                    disabled: invitationState.shareReadonly,
                    onClick: changeCanShare
                })
            })
        ]
    });
};
var $86676b500f2a011a$export$2e2bcd8739ae039 = $86676b500f2a011a$var$ContactItem;









/** @typedef {import("./ShareDialog").InvitationState} InvitationState */ const $35582d4b0c1bf8ac$var$useStyles = (0, ($parcel$interopDefault($fvx3m$muistylesmakeStyles)))((theme)=>({
        listItem: {
            paddingLeft: 0,
            paddingRight: 0
        },
        primaryText: {
            width: "30%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexBasis: "100%"
        },
        secondaryText: {
            textAlign: "center",
            width: "60%",
            fontStyle: "italic",
            color: "grey"
        },
        avatarItem: {
            minWidth: 50
        },
        avatar: {
            backgroundImage: `radial-gradient(circle at 50% 3em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
        }
    }));
/**
 * @param {Object} props
 * @param {import("react-admin").Record} props.group
 * @param {Record<string, InvitationState} props.invitations
 * @param {(invitations: Record<string, InvitationState>) => void} props.onChange
 * @param {boolean} props.isCreator
 */ const $35582d4b0c1bf8ac$var$GroupContactsItem = ({ group: group, onChange: onChange, invitations: invitations, isCreator: isCreator })=>{
    const classes = $35582d4b0c1bf8ac$var$useStyles();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    const groupMemberIds = (0, $f21bc75053423cc3$export$e57ff0f701c44363)(group?.["vcard:hasMember"]);
    const viewChecked = groupMemberIds.every((memberId)=>invitations[memberId]?.canView || invitations[memberId]?.canShare);
    const shareChecked = groupMemberIds.every((memberId)=>invitations[memberId]?.canShare);
    const viewSwitchReadonly = groupMemberIds.every((memberId)=>invitations[memberId]?.viewReadonly || invitations[memberId]?.shareReadonly);
    const shareSwitchReadonly = groupMemberIds.every((memberId)=>invitations[memberId]?.shareReadonly);
    const switchShare = (0, $fvx3m$react.useCallback)(()=>{
        // Create invitation object for every group member.
        const newInvitations = Object.fromEntries(groupMemberIds.map((memberId)=>{
            if (invitations[memberId]?.shareReadonly) return [
                undefined,
                undefined
            ];
            else {
                const newShareState = !shareChecked;
                return [
                    memberId,
                    {
                        ...invitations[memberId],
                        canShare: newShareState,
                        canView: newShareState || viewChecked
                    }
                ];
            }
        }).filter(([key, val])=>key && val));
        onChange(newInvitations);
    }, [
        shareChecked,
        viewChecked,
        invitations,
        onChange,
        groupMemberIds
    ]);
    const switchView = (0, $fvx3m$react.useCallback)(()=>{
        // Create invitation object for every group member.
        const newInvitations = Object.fromEntries(groupMemberIds.map((memberId)=>{
            if (invitations[memberId]?.viewReadonly) return [
                undefined,
                undefined
            ];
            else {
                const newViewState = !viewChecked;
                return [
                    memberId,
                    {
                        ...invitations[memberId],
                        canView: newViewState,
                        canShare: newViewState && shareChecked
                    }
                ];
            }
        }).filter(([key, val])=>key && val));
        onChange(newInvitations);
    }, [
        viewChecked,
        shareChecked,
        invitations,
        onChange,
        groupMemberIds
    ]);
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.ListItem), {
        className: classes.listItem,
        children: [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemAvatar), {
                className: classes.avatarItem,
                children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Avatar), {
                    src: group?.["vcard:photo"],
                    className: classes.avatar,
                    children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialGroup))), {})
                })
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.primaryText,
                primary: group?.["vcard:label"]
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.view"),
                secondary: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Switch), {
                    size: "small",
                    checked: viewChecked,
                    disabled: viewSwitchReadonly || !group,
                    onClick: switchView
                })
            }),
            isCreator && /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.share"),
                secondary: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Switch), {
                    size: "small",
                    checked: shareChecked,
                    disabled: shareSwitchReadonly || !group,
                    onClick: switchShare
                })
            })
        ]
    });
};
var $35582d4b0c1bf8ac$export$2e2bcd8739ae039 = $35582d4b0c1bf8ac$var$GroupContactsItem;



/**
 * @typedef {import('./ShareDialog').InvitationState} InvitationState
 */ const $d4e71d4ba572ee47$var$useStyles = (0, ($parcel$interopDefault($fvx3m$muistylesmakeStyles)))((theme)=>({
        list: {
            width: "98%",
            maxWidth: "98%",
            backgroundColor: theme.palette.background.paper,
            padding: 0
        }
    }));
/**
 * @param {Object} props
 * @param {Record<string, InvitationState} props.invitations
 * @param {(invitations: Record<string, InvitationState) => void} props.onChange
 * @param {boolean} props.isCreator
 */ const $d4e71d4ba572ee47$var$ContactsShareList = ({ invitations: invitations, onChange: onChange, organizerUri: organizerUri, isCreator: isCreator, profileResource: profileResource, groupResource: groupResource })=>{
    const classes = $d4e71d4ba572ee47$var$useStyles();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    const { data: identity } = (0, $fvx3m$reactadmin.useGetIdentity)();
    const [searchText, setSearchText] = (0, $fvx3m$react.useState)("");
    const { data: profilesData, isLoading: loadingProfiles } = (0, $fvx3m$reactadmin.useGetList)(profileResource, {
        pagination: {
            page: 1,
            perPage: 1000
        },
        sort: {
            field: "vcard:given-name",
            order: "ASC"
        }
    });
    const { data: groupsData, isLoading: loadingGroups } = (0, $fvx3m$reactadmin.useGetList)(groupResource, {
        pagination: {
            page: 1,
            perPage: 1000
        },
        sort: {
            field: "vcard:label",
            order: "ASC"
        }
    });
    // Filter here (instead of using the `filter.q` param above) to avoid triggering a SPARQL query on every character change
    const profilesFiltered = (0, $fvx3m$react.useMemo)(()=>profilesData?.filter((profile)=>profile.describes !== organizerUri && profile.describes !== identity?.id).filter((profile)=>(profile["vcard:given-name"] || "").toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) || (0, $f21bc75053423cc3$export$1b2abdd92765429)(profile.describes).toLocaleLowerCase().includes(searchText.toLocaleLowerCase())), [
        profilesData,
        searchText,
        organizerUri,
        identity
    ]);
    const groupsFiltered = (0, $fvx3m$react.useMemo)(()=>{
        return groupsData?.filter((group)=>(group["vcard:label"] || "").toLocaleLowerCase().includes(searchText.toLocaleLowerCase()));
    }, [
        groupsData,
        searchText
    ]);
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.List), {
        dense: true,
        className: classes.list,
        children: [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.TextField), {
                type: "search",
                value: searchText,
                onChange: (event)=>setSearchText(event.target.value),
                label: translate("apods.action.search"),
                fullWidth: true,
                size: "small",
                margin: "dense"
            }),
            groupsFiltered?.map((group)=>/*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $35582d4b0c1bf8ac$export$2e2bcd8739ae039), {
                    group: group,
                    invitations: invitations,
                    onChange: onChange,
                    isCreator: isCreator
                }, group.id)),
            profilesFiltered?.map((profile)=>/*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $86676b500f2a011a$export$2e2bcd8739ae039), {
                    record: profile,
                    invitation: invitations[profile.describes],
                    onChange: onChange,
                    isCreator: isCreator
                }, profile.id)),
            (loadingProfiles || loadingGroups) && /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Box), {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 250,
                children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.CircularProgress), {
                    size: 60,
                    thickness: 6
                })
            }),
            !loadingProfiles && (profilesFiltered?.length, false)
        ]
    });
};
var $d4e71d4ba572ee47$export$2e2bcd8739ae039 = $d4e71d4ba572ee47$var$ContactsShareList;


/**
 * @typedef InvitationState
 * @property {boolean} canView
 * @property {boolean} canShare
 * @property {boolean} viewReadonly
 * @property {boolean} shareReadonly
 */ const $8ffb7dd40d703ae5$var$useStyles = (0, ($parcel$interopDefault($fvx3m$muistylesmakeStyles)))((theme)=>({
        dialogPaper: {
            margin: 16
        },
        title: {
            padding: 24,
            paddingBottom: 8,
            [theme.breakpoints.down("sm")]: {
                padding: 16,
                paddingBottom: 4
            }
        },
        actions: {
            padding: 15,
            height: 38
        },
        list: {
            width: "100%",
            maxWidth: "100%",
            backgroundColor: theme.palette.background.paper,
            padding: 0
        },
        listForm: {
            paddingTop: 0,
            paddingBottom: 0,
            paddingRight: 0,
            marginRight: 24,
            height: 400,
            [theme.breakpoints.down("sm")]: {
                padding: "0px 16px",
                margin: 0,
                height: "unset" // Full screen height for mobile
            }
        }
    }));
const $8ffb7dd40d703ae5$var$ShareDialog = ({ close: close, resourceUri: resourceUri, profileResource: profileResource = "Profile", groupResource: groupResource = "Group" })=>{
    const classes = $8ffb7dd40d703ae5$var$useStyles();
    const { data: identity } = (0, $fvx3m$reactadmin.useGetIdentity)();
    const record = (0, $fvx3m$reactadmin.useRecordContext)();
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    const creatorUri = record?.["dc:creator"];
    const isCreator = creatorUri && creatorUri === identity?.id;
    const { items: announces } = (0, $fvx3m$semappsactivitypubcomponents.useCollection)(record?.["apods:announces"]);
    const { items: announcers } = (0, $fvx3m$semappsactivitypubcomponents.useCollection)(isCreator ? record?.["apods:announcers"] : undefined);
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [invitations, setInvitations] = (0, $fvx3m$react.useState)({});
    // To keep track of changes...
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [newInvitations, setNewInvitations] = (0, $fvx3m$react.useState)({});
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [savedInvitations, setSavedInvitations] = (0, $fvx3m$react.useState)({});
    const [sendingInvitation, setSendingInvitation] = (0, $fvx3m$react.useState)(false);
    const xs = (0, $fvx3m$muimaterial.useMediaQuery)((theme)=>theme.breakpoints.down("xs"), {
        noSsr: true
    });
    const outbox = (0, $fvx3m$semappsactivitypubcomponents.useOutbox)();
    const notify = (0, $fvx3m$reactadmin.useNotify)();
    // To begin, populate present invitations.
    // Announcers and announces that are already in the collection are readonly.
    (0, $fvx3m$react.useEffect)(()=>{
        const invitations = [
            ...announces,
            ...announcers
        ].reduce((acc, actorUri)=>{
            const canView = announces.includes(actorUri);
            const canShare = announcers.includes(actorUri);
            return {
                ...acc,
                [actorUri]: {
                    canView: canView,
                    canShare: canShare,
                    viewReadonly: canView,
                    shareReadonly: canShare
                }
            };
        }, {});
        setInvitations(invitations);
        setSavedInvitations(invitations);
    }, [
        announces,
        announcers,
        setInvitations,
        setSavedInvitations
    ]);
    /** @param {Record<string, InvitationState} changedRights */ const onChange = (0, $fvx3m$react.useCallback)((changedRights)=>{
        // Compare changedRights to invitations, to know where we need to update the collection.
        const newInvitationsUnfiltered = {
            ...newInvitations,
            ...changedRights
        };
        const changedInvitations = Object.fromEntries(Object.entries(newInvitationsUnfiltered).filter(([actorUri, newInvitation])=>{
            const oldInvitation = savedInvitations[actorUri];
            return !!newInvitation.canView !== (!!oldInvitation?.canView || !!oldInvitation?.canShare) || !!newInvitation.canShare !== !!oldInvitation?.canShare;
        }));
        setNewInvitations(changedInvitations);
        setInvitations({
            ...savedInvitations,
            ...changedInvitations
        });
    }, [
        newInvitations,
        savedInvitations
    ]);
    const sendInvitations = (0, $fvx3m$react.useCallback)(async ()=>{
        setSendingInvitation(true);
        const actorsWithNewViewRight = Object.keys(newInvitations).filter((actorUri)=>newInvitations[actorUri].canView && !newInvitations[actorUri].canShare);
        if (actorsWithNewViewRight.length > 0) outbox.post({
            type: (0, $fvx3m$semappsactivitypubcomponents.ACTIVITY_TYPES).ANNOUNCE,
            actor: outbox.owner,
            object: resourceUri,
            to: actorsWithNewViewRight
        });
        const actorsWithNewShareRight = Object.keys(newInvitations).filter((actorUri)=>newInvitations[actorUri].canShare);
        if (actorsWithNewShareRight.length > 0) outbox.post({
            type: (0, $fvx3m$semappsactivitypubcomponents.ACTIVITY_TYPES).ANNOUNCE,
            actor: outbox.owner,
            object: resourceUri,
            to: actorsWithNewShareRight,
            "interop:delegationAllowed": true,
            "interop:delegationLimit": 1
        });
        notify("apods.notification.invitation_sent", {
            type: "success",
            messageArgs: {
                smart_count: Object.keys(newInvitations).length
            }
        });
        close();
    }, [
        outbox,
        notify,
        savedInvitations,
        newInvitations,
        isCreator,
        close,
        record,
        resourceUri,
        setSendingInvitation
    ]);
    if (!identity) return null;
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.Dialog), {
        fullWidth: !xs,
        open: true,
        onClose: close,
        classes: {
            paper: classes.dialogPaper
        },
        children: [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.DialogTitle), {
                className: classes.title,
                children: translate("apods.action.share")
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.DialogContent), {
                className: classes.listForm,
                children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $d4e71d4ba572ee47$export$2e2bcd8739ae039), {
                    invitations: invitations,
                    onChange: onChange,
                    organizerUri: creatorUri,
                    isCreator: isCreator,
                    profileResource: profileResource,
                    groupResource: groupResource
                })
            }),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.DialogActions), {
                className: classes.actions,
                children: [
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Button), {
                        variant: "text",
                        size: "medium",
                        onClick: close,
                        children: translate("ra.action.close")
                    }),
                    Object.keys(newInvitations).length > 0 && /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.Button), {
                        variant: "contained",
                        color: "primary",
                        size: "medium",
                        onClick: sendInvitations,
                        disabled: sendingInvitation,
                        children: translate("apods.action.send_invitation", {
                            smart_count: Object.keys(newInvitations).length
                        })
                    })
                ]
            })
        ]
    });
};
var $8ffb7dd40d703ae5$export$2e2bcd8739ae039 = $8ffb7dd40d703ae5$var$ShareDialog;


/**
 * Allow to share the record in the current RecordContext
 * Use the `Announce` and `Offer > Announce` activities handled by ActivityPods
 */ const $c30b6e8e8f4f1d51$var$ShareButton = ({ profileResource: profileResource = "Profile", groupResource: groupResource = "Group" })=>{
    const [shareOpen, setShareOpen] = (0, $fvx3m$react.useState)(false);
    const record = (0, $fvx3m$reactadmin.useRecordContext)();
    const { error: error, isLoading: isLoading } = (0, $fvx3m$semappsactivitypubcomponents.useCollection)(record?.["apods:announces"]);
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    // If the user can see the list of announces, it means he can share
    if (!isLoading && !error) return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$reactjsxruntime.Fragment), {
        children: [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$reactadmin.Button), {
                label: translate("apods.action.share"),
                onClick: ()=>setShareOpen(true),
                children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialShare))), {})
            }),
            shareOpen && /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $8ffb7dd40d703ae5$export$2e2bcd8739ae039), {
                resourceUri: record.id,
                close: ()=>setShareOpen(false),
                profileResource: profileResource,
                groupResource: groupResource
            })
        ]
    });
    else return null;
};
var $c30b6e8e8f4f1d51$export$2e2bcd8739ae039 = $c30b6e8e8f4f1d51$var$ShareButton;





// Set the app locale to the user's locale, if it is set
const $418040ff16c1a946$var$SyncUserLocale = ()=>{
    const [locale, setLocale] = (0, $fvx3m$reactadmin.useLocaleState)();
    const { data: identity } = (0, $fvx3m$reactadmin.useGetIdentity)();
    (0, $fvx3m$react.useEffect)(()=>{
        if (identity?.webIdData?.["schema:knowsLanguage"] && identity?.webIdData?.["schema:knowsLanguage"] !== locale) setLocale(identity?.webIdData?.["schema:knowsLanguage"]);
    }, [
        locale,
        setLocale,
        identity
    ]);
};
var $418040ff16c1a946$export$2e2bcd8739ae039 = $418040ff16c1a946$var$SyncUserLocale;












const $fc1368eec161415d$var$UserMenu = ()=>{
    const { data: identity } = (0, $fvx3m$reactadmin.useGetIdentity)();
    const nodeinfo = (0, $fvx3m$semappsactivitypubcomponents.useNodeinfo)(identity?.webIdData?.["solid:oidcIssuer"] && new URL(identity?.webIdData?.["solid:oidcIssuer"]).host);
    const translate = (0, $fvx3m$reactadmin.useTranslate)();
    if (identity?.id && !nodeinfo) return null;
    return /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$reactadmin.UserMenu), {
        children: identity?.id ? [
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.MenuItem), {
                component: "a",
                href: (0, ($parcel$interopDefault($fvx3m$urljoin)))(nodeinfo?.metadata?.frontend_url, "network"),
                children: [
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemIcon), {
                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialPeopleAlt))), {})
                    }),
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                        children: translate("apods.user_menu.network")
                    })
                ]
            }, "network"),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.MenuItem), {
                component: "a",
                href: (0, ($parcel$interopDefault($fvx3m$urljoin)))(nodeinfo?.metadata?.frontend_url, "apps"),
                children: [
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemIcon), {
                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialApps))), {})
                    }),
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                        children: translate("apods.user_menu.apps")
                    })
                ]
            }, "apps"),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.MenuItem), {
                component: "a",
                href: (0, ($parcel$interopDefault($fvx3m$urljoin)))(nodeinfo?.metadata?.frontend_url, "data"),
                children: [
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemIcon), {
                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialStorage))), {})
                    }),
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                        children: translate("apods.user_menu.data")
                    })
                ]
            }, "data"),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsxs)((0, $fvx3m$muimaterial.MenuItem), {
                component: "a",
                href: (0, ($parcel$interopDefault($fvx3m$urljoin)))(nodeinfo?.metadata?.frontend_url, "settings"),
                children: [
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemIcon), {
                        children: /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, ($parcel$interopDefault($fvx3m$muiiconsmaterialSettings))), {})
                    }),
                    /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$muimaterial.ListItemText), {
                        children: translate("apods.user_menu.settings")
                    })
                ]
            }, "settings"),
            /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$reactadmin.Logout), {}, "logout")
        ] : /*#__PURE__*/ (0, $fvx3m$reactjsxruntime.jsx)((0, $fvx3m$reactadmin.MenuItemLink), {
            to: "/login",
            primaryText: translate("ra.auth.sign_in")
        })
    });
};
var $fc1368eec161415d$export$2e2bcd8739ae039 = $fc1368eec161415d$var$UserMenu;


// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts
var $4b1314efa6ba34c8$export$2e2bcd8739ae039 = {
    apods: {
        action: {
            search: "Search",
            share: "Share",
            send_invitation: "Send invitation |||| Send %{smart_count} invitations"
        },
        helper: {
            no_contact: "You must add contacts to your network to share resources with them"
        },
        notification: {
            invitation_sent: "1 invitation sent |||| %{smart_count} invitations sent"
        },
        permission: {
            view: "Allowed to view",
            share: "Invite own contacts"
        },
        error: {
            app_status_unavailable: "Unable to check app status",
            app_offline: "The app backend is offline",
            app_not_registered: "The app is not registered",
            app_not_listening: "The app is not listening to %{uri}",
            user_authorization_agent_not_found: "User authorization agent not found"
        },
        user_menu: {
            network: "My network",
            apps: "My applications",
            data: "My data",
            settings: "Settings"
        }
    }
};


// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts
var $7955e6b2ad1a54ef$export$2e2bcd8739ae039 = {
    apods: {
        action: {
            search: "Rechercher",
            send_invitation: "Envoyer l'invitation |||| Envoyer %{smart_count} invitations",
            share: "Partager"
        },
        helper: {
            no_contact: "Vous devez ajouter des contacts \xe0 votre r\xe9seau pour leur partager des ressources"
        },
        notification: {
            invitation_sent: "1 invitation envoy\xe9e |||| %{smart_count} invitations envoy\xe9es"
        },
        permission: {
            view: "Droit de voir",
            share: "Inviter ses contacts"
        },
        error: {
            app_status_unavailable: "Impossible de v\xe9rifier le statut de l'application",
            app_offline: "L'application est hors ligne",
            app_not_registered: "L'application n'est pas enregistr\xe9e",
            app_not_listening: "L'application n'\xe9coute pas %{uri}"
        },
        user_menu: {
            network: "Mon r\xe9seau",
            apps: "Mes applis",
            data: "Mes donn\xe9es",
            settings: "Param\xe8tres"
        }
    }
};




//# sourceMappingURL=index.cjs.js.map
