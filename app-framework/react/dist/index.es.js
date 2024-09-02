import {useState as $hgUW1$useState, useCallback as $hgUW1$useCallback, useEffect as $hgUW1$useEffect, useLayoutEffect as $hgUW1$useLayoutEffect, Fragment as $hgUW1$Fragment} from "react";
import $hgUW1$urljoin from "url-join";
import {useGetIdentity as $hgUW1$useGetIdentity, useNotify as $hgUW1$useNotify, useLocaleState as $hgUW1$useLocaleState, useLogin as $hgUW1$useLogin, useLogout as $hgUW1$useLogout, useTranslate as $hgUW1$useTranslate, useRedirect as $hgUW1$useRedirect} from "react-admin";
import {useNodeinfo as $hgUW1$useNodeinfo} from "@semapps/activitypub-components";
import {jsx as $hgUW1$jsx, jsxs as $hgUW1$jsxs} from "react/jsx-runtime";
import {useSearchParams as $hgUW1$useSearchParams, useNavigate as $hgUW1$useNavigate} from "react-router-dom";
import {Box as $hgUW1$Box, Card as $hgUW1$Card, Avatar as $hgUW1$Avatar, Typography as $hgUW1$Typography, List as $hgUW1$List, Divider as $hgUW1$Divider, ListItem as $hgUW1$ListItem, ListItemButton as $hgUW1$ListItemButton, ListItemAvatar as $hgUW1$ListItemAvatar, ListItemText as $hgUW1$ListItemText} from "@mui/material";
import $hgUW1$muiiconsmaterialLock from "@mui/icons-material/Lock";
import $hgUW1$muiiconsmaterialStorage from "@mui/icons-material/Storage";
import {useDataModels as $hgUW1$useDataModels} from "@semapps/semantic-data-provider";

// Components




/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 */ const $108dda5a21c124cd$var$BackgroundChecks = ({ clientId: clientId, children: children })=>{
    const { data: identity, isLoading: isIdentityLoading } = (0, $hgUW1$useGetIdentity)();
    const notify = (0, $hgUW1$useNotify)();
    const [appStatus, setAppStatus] = (0, $hgUW1$useState)();
    const nodeinfo = (0, $hgUW1$useNodeinfo)(identity?.id ? new URL(identity?.id).host : undefined);
    const isLoggedOut = !isIdentityLoading && !identity?.id;
    const checkAppStatus = (0, $hgUW1$useCallback)(async ()=>{
        // Only proceed if the tab is visible
        if (!document.hidden && identity?.id) {
            const oidcIssuer = new URL(identity?.id).origin;
            const endpointUrl = (0, $hgUW1$urljoin)(oidcIssuer, ".well-known/app-status");
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
    (0, $hgUW1$useEffect)(()=>{
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
    (0, $hgUW1$useLayoutEffect)(()=>{
        document.addEventListener("visibilitychange", checkAppStatus);
        return ()=>document.removeEventListener("visibilitychange", checkAppStatus);
    }, [
        checkAppStatus
    ]);
    // TODO display error message instead of notifications
    if (isLoggedOut || appStatus?.onlineBackend === true && appStatus?.installed === true && appStatus?.upgradeNeeded === false) return children;
    else return null;
};
var $108dda5a21c124cd$export$2e2bcd8739ae039 = $108dda5a21c124cd$var$BackgroundChecks;









/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */ const $19bdbb31e5826e00$var$PodLoginPageView = ({ text: text, customPodProviders: customPodProviders })=>{
    const notify = (0, $hgUW1$useNotify)();
    const [searchParams] = (0, $hgUW1$useSearchParams)();
    const [locale] = (0, $hgUW1$useLocaleState)();
    const login = (0, $hgUW1$useLogin)();
    const logout = (0, $hgUW1$useLogout)();
    const translate = (0, $hgUW1$useTranslate)();
    const redirect = (0, $hgUW1$useRedirect)();
    const { data: identity, isLoading: isIdentityLoading } = (0, $hgUW1$useGetIdentity)();
    const [podProviders, setPodProviders] = (0, $hgUW1$useState)(customPodProviders || []);
    const isSignup = searchParams.has("signup");
    const redirectUrl = searchParams.get("redirect");
    (0, $hgUW1$useEffect)(()=>{
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
    (0, $hgUW1$useEffect)(()=>{
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
    return /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        children: /*#__PURE__*/ (0, $hgUW1$jsxs)((0, $hgUW1$Card), {
            sx: {
                minWidth: 300,
                maxWidth: 350,
                marginTop: "6em"
            },
            children: [
                /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Box), {
                    sx: {
                        margin: "1em",
                        display: "flex",
                        justifyContent: "center"
                    },
                    children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Avatar), {
                        children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$muiiconsmaterialLock), {})
                    })
                }),
                /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Box), {
                    pl: 2,
                    pr: 2,
                    children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Typography), {
                        variant: "body2",
                        sx: {
                            textAlign: "center",
                            padding: "4px 8px 8px"
                        },
                        children: text || translate("auth.message.choose_pod_provider")
                    })
                }),
                /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Box), {
                    m: 2,
                    children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$List), {
                        sx: {
                            paddingTop: 0,
                            paddingBottom: 0
                        },
                        children: podProviders.map((podProvider, i)=>/*#__PURE__*/ (0, $hgUW1$jsxs)((0, $hgUW1$Fragment), {
                                children: [
                                    /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Divider), {}),
                                    /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$ListItem), {
                                        children: /*#__PURE__*/ (0, $hgUW1$jsxs)((0, $hgUW1$ListItemButton), {
                                            onClick: ()=>login({
                                                    issuer: podProvider["apods:baseUrl"],
                                                    redirect: redirectUrl || undefined,
                                                    isSignup: isSignup
                                                }),
                                            children: [
                                                /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$ListItemAvatar), {
                                                    children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$Avatar), {
                                                        children: /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$muiiconsmaterialStorage), {})
                                                    })
                                                }),
                                                /*#__PURE__*/ (0, $hgUW1$jsx)((0, $hgUW1$ListItemText), {
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
var $19bdbb31e5826e00$export$2e2bcd8739ae039 = $19bdbb31e5826e00$var$PodLoginPageView;





const $b95f7ef91db4a4a8$var$prefix = (uri, ontologies)=>{
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
 */ const $b95f7ef91db4a4a8$var$RedirectPage = ({ ontologies: ontologies })=>{
    const dataModels = (0, $hgUW1$useDataModels)();
    const navigate = (0, $hgUW1$useNavigate)();
    const [searchParams] = (0, $hgUW1$useSearchParams)();
    (0, $hgUW1$useEffect)(()=>{
        if (dataModels) {
            const prefixedType = $b95f7ef91db4a4a8$var$prefix(searchParams.get("type"), ontologies);
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
var $b95f7ef91db4a4a8$export$2e2bcd8739ae039 = $b95f7ef91db4a4a8$var$RedirectPage;




export {$108dda5a21c124cd$export$2e2bcd8739ae039 as BackgroundChecks, $19bdbb31e5826e00$export$2e2bcd8739ae039 as PodLoginPage, $b95f7ef91db4a4a8$export$2e2bcd8739ae039 as RedirectPage};
//# sourceMappingURL=index.es.js.map
