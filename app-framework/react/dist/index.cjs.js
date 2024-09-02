var $8zHUo$react = require("react");
var $8zHUo$urljoin = require("url-join");
var $8zHUo$reactadmin = require("react-admin");
var $8zHUo$semappsactivitypubcomponents = require("@semapps/activitypub-components");
var $8zHUo$reactjsxruntime = require("react/jsx-runtime");
var $8zHUo$reactrouterdom = require("react-router-dom");
var $8zHUo$muimaterial = require("@mui/material");
var $8zHUo$muiiconsmaterialLock = require("@mui/icons-material/Lock");
var $8zHUo$muiiconsmaterialStorage = require("@mui/icons-material/Storage");
var $8zHUo$semappssemanticdataprovider = require("@semapps/semantic-data-provider");


function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "BackgroundChecks", () => $08a9b9801e65ec6a$export$2e2bcd8739ae039);
$parcel$export(module.exports, "PodLoginPage", () => $a9b50b7df7a5c1d3$export$2e2bcd8739ae039);
$parcel$export(module.exports, "RedirectPage", () => $dd351af34199ef96$export$2e2bcd8739ae039);
// Components




/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 */ const $08a9b9801e65ec6a$var$BackgroundChecks = ({ clientId: clientId, children: children })=>{
    const { data: identity, isLoading: isIdentityLoading } = (0, $8zHUo$reactadmin.useGetIdentity)();
    const notify = (0, $8zHUo$reactadmin.useNotify)();
    const [appStatus, setAppStatus] = (0, $8zHUo$react.useState)();
    const nodeinfo = (0, $8zHUo$semappsactivitypubcomponents.useNodeinfo)(identity?.id ? new URL(identity?.id).host : undefined);
    const isLoggedOut = !isIdentityLoading && !identity?.id;
    const checkAppStatus = (0, $8zHUo$react.useCallback)(async ()=>{
        // Only proceed if the tab is visible
        if (!document.hidden && identity?.id) {
            const oidcIssuer = new URL(identity?.id).origin;
            const endpointUrl = (0, ($parcel$interopDefault($8zHUo$urljoin)))(oidcIssuer, ".well-known/app-status");
            const token = localStorage.getItem("token");
            try {
                // Don't use dataProvider.fetch as it would go through the proxy
                const response = await fetch(endpointUrl, {
                    headers: new Headers({
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json"
                    })
                });
                if (response.ok) {
                    const appStatus = await response.json();
                    if (appStatus) {
                        setAppStatus(appStatus);
                        if (!appStatus.onlineBackend) notify(`The app backend is offline`, {
                            type: "error"
                        });
                        else if (!appStatus.installed) notify(`The app is not installed`, {
                            type: "error"
                        });
                        else if (appStatus.upgradeNeeded) {
                            const consentUrl = new URL(nodeinfo?.metadata?.consent_url);
                            consentUrl.searchParams.append("client_id", clientId);
                            consentUrl.searchParams.append("redirect", window.location.href);
                            window.location.href = consentUrl.toString();
                        }
                    }
                }
            } catch (e) {
                notify(`Unable to check app status`, {
                    type: "error"
                });
            }
        }
    }, [
        identity,
        nodeinfo,
        setAppStatus,
        document
    ]);
    (0, $8zHUo$react.useEffect)(()=>{
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
    (0, $8zHUo$react.useLayoutEffect)(()=>{
        document.addEventListener("visibilitychange", checkAppStatus);
        return ()=>document.removeEventListener("visibilitychange", checkAppStatus);
    }, [
        checkAppStatus
    ]);
    // TODO display error message instead of notifications
    if (isLoggedOut || appStatus?.onlineBackend === true && appStatus?.installed === true && appStatus?.upgradeNeeded === false) return children;
    else return null;
};
var $08a9b9801e65ec6a$export$2e2bcd8739ae039 = $08a9b9801e65ec6a$var$BackgroundChecks;









/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */ const $a9b50b7df7a5c1d3$var$PodLoginPageView = ({ text: text, customPodProviders: customPodProviders })=>{
    const notify = (0, $8zHUo$reactadmin.useNotify)();
    const [searchParams] = (0, $8zHUo$reactrouterdom.useSearchParams)();
    const [locale] = (0, $8zHUo$reactadmin.useLocaleState)();
    const login = (0, $8zHUo$reactadmin.useLogin)();
    const logout = (0, $8zHUo$reactadmin.useLogout)();
    const translate = (0, $8zHUo$reactadmin.useTranslate)();
    const redirect = (0, $8zHUo$reactadmin.useRedirect)();
    const { data: identity, isLoading: isIdentityLoading } = (0, $8zHUo$reactadmin.useGetIdentity)();
    const [podProviders, setPodProviders] = (0, $8zHUo$react.useState)(customPodProviders || []);
    const isSignup = searchParams.has("signup");
    const redirectUrl = searchParams.get("redirect");
    (0, $8zHUo$react.useEffect)(()=>{
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
    (0, $8zHUo$react.useEffect)(()=>{
        if (searchParams.has("iss")) // Automatically login if Pod provider is known
        login({
            issuer: searchParams.get("iss")
        });
        else if (searchParams.has("logout")) logout({
            redirectUrl: redirectUrl
        });
        else if (!isIdentityLoading && identity?.id) redirect("/");
    }, [
        searchParams,
        login,
        logout,
        identity,
        isIdentityLoading,
        redirect,
        redirectUrl
    ]);
    if (isIdentityLoading) return null;
    return /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsxs)((0, $8zHUo$muimaterial.Card), {
            sx: {
                minWidth: 300,
                maxWidth: 350,
                marginTop: "6em"
            },
            children: [
                /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Box), {
                    sx: {
                        margin: "1em",
                        display: "flex",
                        justifyContent: "center"
                    },
                    children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Avatar), {
                        children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, ($parcel$interopDefault($8zHUo$muiiconsmaterialLock))), {})
                    })
                }),
                /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Box), {
                    pl: 2,
                    pr: 2,
                    children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Typography), {
                        variant: "body2",
                        sx: {
                            textAlign: "center",
                            padding: "4px 8px 8px"
                        },
                        children: text || translate("auth.message.choose_pod_provider")
                    })
                }),
                /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Box), {
                    m: 2,
                    children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.List), {
                        sx: {
                            paddingTop: 0,
                            paddingBottom: 0
                        },
                        children: podProviders.map((podProvider, i)=>/*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsxs)((0, $8zHUo$react.Fragment), {
                                children: [
                                    /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Divider), {}),
                                    /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.ListItem), {
                                        children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsxs)((0, $8zHUo$muimaterial.ListItemButton), {
                                            onClick: ()=>login({
                                                    issuer: podProvider["apods:baseUrl"],
                                                    redirect: redirectUrl || undefined,
                                                    isSignup: isSignup
                                                }),
                                            children: [
                                                /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.ListItemAvatar), {
                                                    children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.Avatar), {
                                                        children: /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, ($parcel$interopDefault($8zHUo$muiiconsmaterialStorage))), {})
                                                    })
                                                }),
                                                /*#__PURE__*/ (0, $8zHUo$reactjsxruntime.jsx)((0, $8zHUo$muimaterial.ListItemText), {
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
var $a9b50b7df7a5c1d3$export$2e2bcd8739ae039 = $a9b50b7df7a5c1d3$var$PodLoginPageView;





const $dd351af34199ef96$var$prefix = (uri, ontologies)=>{
    if (!uri) return;
    if (!uri.startsWith("http")) return uri; // If it is already prefixed
    const ontology = ontologies.find((o)=>uri.startsWith(o.url));
    return ontology && uri.replace(ontology.url, ontology.prefix + ":");
};
/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 * This page is called from the data browser in the Pod provider
 */ const $dd351af34199ef96$var$RedirectPage = ({ ontologies: ontologies })=>{
    const dataModels = (0, $8zHUo$semappssemanticdataprovider.useDataModels)();
    const navigate = (0, $8zHUo$reactrouterdom.useNavigate)();
    const [searchParams] = (0, $8zHUo$reactrouterdom.useSearchParams)();
    (0, $8zHUo$react.useEffect)(()=>{
        if (dataModels) {
            const prefixedType = $dd351af34199ef96$var$prefix(searchParams.get("type"), ontologies);
            const resource = prefixedType && Object.keys(dataModels).find((key)=>dataModels[key].types && dataModels[key].types.includes(prefixedType));
            if (searchParams.has("uri")) navigate(`/${resource}/${encodeURIComponent(searchParams.get("uri"))}${searchParams.get("mode") === "show" ? "/show" : ""}`);
            else if (resource) navigate(`/${resource}`);
            else navigate("/");
        }
    }, [
        dataModels,
        searchParams,
        navigate
    ]);
    return null;
};
var $dd351af34199ef96$export$2e2bcd8739ae039 = $dd351af34199ef96$var$RedirectPage;




//# sourceMappingURL=index.cjs.js.map
