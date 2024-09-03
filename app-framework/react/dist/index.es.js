import {useState as $iLwJW$useState, useCallback as $iLwJW$useCallback, useEffect as $iLwJW$useEffect, useLayoutEffect as $iLwJW$useLayoutEffect, Fragment as $iLwJW$Fragment} from "react";
import $iLwJW$urljoin from "url-join";
import {useGetIdentity as $iLwJW$useGetIdentity, useNotify as $iLwJW$useNotify, useLocaleState as $iLwJW$useLocaleState, useLogin as $iLwJW$useLogin, useLogout as $iLwJW$useLogout, useTranslate as $iLwJW$useTranslate, useRedirect as $iLwJW$useRedirect} from "react-admin";
import {useNodeinfo as $iLwJW$useNodeinfo} from "@semapps/activitypub-components";
import {jsx as $iLwJW$jsx, jsxs as $iLwJW$jsxs} from "react/jsx-runtime";
import {useSearchParams as $iLwJW$useSearchParams, useNavigate as $iLwJW$useNavigate} from "react-router-dom";
import {Box as $iLwJW$Box, Card as $iLwJW$Card, Avatar as $iLwJW$Avatar, Typography as $iLwJW$Typography, List as $iLwJW$List, Divider as $iLwJW$Divider, ListItem as $iLwJW$ListItem, ListItemButton as $iLwJW$ListItemButton, ListItemAvatar as $iLwJW$ListItemAvatar, ListItemText as $iLwJW$ListItemText} from "@mui/material";
import $iLwJW$muiiconsmaterialLock from "@mui/icons-material/Lock";
import $iLwJW$muiiconsmaterialStorage from "@mui/icons-material/Storage";
import {useDataModels as $iLwJW$useDataModels} from "@semapps/semantic-data-provider";

// Components




/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 */ const $2957839fe06af793$var$BackgroundChecks = ({ clientId: clientId, children: children })=>{
    const { data: identity, isLoading: isIdentityLoading } = (0, $iLwJW$useGetIdentity)();
    const notify = (0, $iLwJW$useNotify)();
    const [appStatus, setAppStatus] = (0, $iLwJW$useState)();
    const nodeinfo = (0, $iLwJW$useNodeinfo)(identity?.id ? new URL(identity?.id).host : undefined);
    const isLoggedOut = !isIdentityLoading && !identity?.id;
    const checkAppStatus = (0, $iLwJW$useCallback)(async ()=>{
        // Only proceed if the tab is visible
        if (!document.hidden && identity?.id) {
            const oidcIssuer = new URL(identity?.id).origin;
            const endpointUrl = (0, $iLwJW$urljoin)(oidcIssuer, ".well-known/app-status");
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
    (0, $iLwJW$useEffect)(()=>{
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
    (0, $iLwJW$useLayoutEffect)(()=>{
        document.addEventListener("visibilitychange", checkAppStatus);
        return ()=>document.removeEventListener("visibilitychange", checkAppStatus);
    }, [
        checkAppStatus
    ]);
    // TODO display error message instead of notifications
    if (isLoggedOut || appStatus?.onlineBackend === true && appStatus?.installed === true && appStatus?.upgradeNeeded === false) return children;
    else return null;
};
var $2957839fe06af793$export$2e2bcd8739ae039 = $2957839fe06af793$var$BackgroundChecks;









/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */ const $e235591816215308$var$PodLoginPageView = ({ text: text, customPodProviders: customPodProviders })=>{
    const notify = (0, $iLwJW$useNotify)();
    const [searchParams] = (0, $iLwJW$useSearchParams)();
    const [locale] = (0, $iLwJW$useLocaleState)();
    const login = (0, $iLwJW$useLogin)();
    const logout = (0, $iLwJW$useLogout)();
    const translate = (0, $iLwJW$useTranslate)();
    const redirect = (0, $iLwJW$useRedirect)();
    const { data: identity, isLoading: isIdentityLoading } = (0, $iLwJW$useGetIdentity)();
    const [podProviders, setPodProviders] = (0, $iLwJW$useState)(customPodProviders || []);
    const isSignup = searchParams.has("signup");
    const redirectUrl = searchParams.get("redirect");
    (0, $iLwJW$useEffect)(()=>{
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
    (0, $iLwJW$useEffect)(()=>{
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
    return /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        children: /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$Card), {
            sx: {
                minWidth: 300,
                maxWidth: 350,
                marginTop: "6em"
            },
            children: [
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
                    sx: {
                        margin: "1em",
                        display: "flex",
                        justifyContent: "center"
                    },
                    children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Avatar), {
                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialLock), {})
                    })
                }),
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
                    pl: 2,
                    pr: 2,
                    children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Typography), {
                        variant: "body2",
                        sx: {
                            textAlign: "center",
                            padding: "4px 8px 8px"
                        },
                        children: text || translate("auth.message.choose_pod_provider")
                    })
                }),
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
                    m: 2,
                    children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$List), {
                        sx: {
                            paddingTop: 0,
                            paddingBottom: 0
                        },
                        children: podProviders.map((podProvider, i)=>/*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$Fragment), {
                                children: [
                                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Divider), {}),
                                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItem), {
                                        children: /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$ListItemButton), {
                                            onClick: ()=>login({
                                                    issuer: podProvider["apods:baseUrl"],
                                                    redirect: redirectUrl || undefined,
                                                    isSignup: isSignup
                                                }),
                                            children: [
                                                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemAvatar), {
                                                    children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Avatar), {
                                                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialStorage), {})
                                                    })
                                                }),
                                                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
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
var $e235591816215308$export$2e2bcd8739ae039 = $e235591816215308$var$PodLoginPageView;





const $1a88c39afebe872d$var$prefix = (uri, ontologies)=>{
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
 */ const $1a88c39afebe872d$var$RedirectPage = ({ ontologies: ontologies })=>{
    const dataModels = (0, $iLwJW$useDataModels)();
    const navigate = (0, $iLwJW$useNavigate)();
    const [searchParams] = (0, $iLwJW$useSearchParams)();
    (0, $iLwJW$useEffect)(()=>{
        if (dataModels) {
            const prefixedType = $1a88c39afebe872d$var$prefix(searchParams.get("type"), ontologies);
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
var $1a88c39afebe872d$export$2e2bcd8739ae039 = $1a88c39afebe872d$var$RedirectPage;




export {$2957839fe06af793$export$2e2bcd8739ae039 as BackgroundChecks, $e235591816215308$export$2e2bcd8739ae039 as PodLoginPage, $1a88c39afebe872d$export$2e2bcd8739ae039 as RedirectPage};
//# sourceMappingURL=index.es.js.map
