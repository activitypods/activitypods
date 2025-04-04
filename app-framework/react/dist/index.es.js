import {useState as $iLwJW$useState, useCallback as $iLwJW$useCallback, useEffect as $iLwJW$useEffect, useLayoutEffect as $iLwJW$useLayoutEffect, Fragment as $iLwJW$Fragment, useMemo as $iLwJW$useMemo} from "react";
import {useGetIdentity as $iLwJW$useGetIdentity, useDataProvider as $iLwJW$useDataProvider, useTranslate as $iLwJW$useTranslate, useLogout as $iLwJW$useLogout, useRedirect as $iLwJW$useRedirect, useNotify as $iLwJW$useNotify, useLocaleState as $iLwJW$useLocaleState, useLogin as $iLwJW$useLogin, useRecordContext as $iLwJW$useRecordContext, Button as $iLwJW$Button1, useGetList as $iLwJW$useGetList, UserMenu as $iLwJW$UserMenu, Logout as $iLwJW$Logout, MenuItemLink as $iLwJW$MenuItemLink} from "react-admin";
import {useNodeinfo as $iLwJW$useNodeinfo, useCollection as $iLwJW$useCollection, useOutbox as $iLwJW$useOutbox, ACTIVITY_TYPES as $iLwJW$ACTIVITY_TYPES} from "@semapps/activitypub-components";
import {jsx as $iLwJW$jsx, jsxs as $iLwJW$jsxs, Fragment as $iLwJW$Fragment1} from "react/jsx-runtime";
import {Box as $iLwJW$Box, Typography as $iLwJW$Typography, Button as $iLwJW$Button, CircularProgress as $iLwJW$CircularProgress, Card as $iLwJW$Card, Avatar as $iLwJW$Avatar, List as $iLwJW$List, Divider as $iLwJW$Divider, ListItem as $iLwJW$ListItem, ListItemButton as $iLwJW$ListItemButton, ListItemAvatar as $iLwJW$ListItemAvatar, ListItemText as $iLwJW$ListItemText, useMediaQuery as $iLwJW$useMediaQuery, Dialog as $iLwJW$Dialog, DialogTitle as $iLwJW$DialogTitle, DialogContent as $iLwJW$DialogContent, DialogActions as $iLwJW$DialogActions, TextField as $iLwJW$TextField, Switch as $iLwJW$Switch, MenuItem as $iLwJW$MenuItem, ListItemIcon as $iLwJW$ListItemIcon} from "@mui/material";
import $iLwJW$muiiconsmaterialError from "@mui/icons-material/Error";
import $iLwJW$urljoin from "url-join";
import $iLwJW$httplinkheader from "http-link-header";
import $iLwJW$jwtdecode from "jwt-decode";
import {useSearchParams as $iLwJW$useSearchParams, useNavigate as $iLwJW$useNavigate} from "react-router-dom";
import $iLwJW$muiiconsmaterialLock from "@mui/icons-material/Lock";
import $iLwJW$muiiconsmaterialStorage from "@mui/icons-material/Storage";
import {useDataProviderConfig as $iLwJW$useDataProviderConfig, getUriFromPrefix as $iLwJW$getUriFromPrefix} from "@semapps/semantic-data-provider";
import $iLwJW$muiiconsmaterialShare from "@mui/icons-material/Share";
import $iLwJW$muistylesmakeStyles from "@mui/styles/makeStyles";
import $iLwJW$muiiconsmaterialGroup from "@mui/icons-material/Group";
import $iLwJW$muiiconsmaterialPeopleAlt from "@mui/icons-material/PeopleAlt";
import $iLwJW$muiiconsmaterialApps from "@mui/icons-material/Apps";
import $iLwJW$muiiconsmaterialSettings from "@mui/icons-material/Settings";

// Components






const $93d7a9f3166de761$export$1b2abdd92765429 = (uri)=>{
    const url = new URL(uri);
    const username = url.pathname.split("/")[1];
    return "@" + username + "@" + url.host;
};
const $93d7a9f3166de761$export$e57ff0f701c44363 = (value)=>{
    // If the field is null-ish, we suppose there are no values.
    if (!value) return [];
    // Return as is.
    if (Array.isArray(value)) return value;
    // Single value is made an array.
    return [
        value
    ];
};
const $93d7a9f3166de761$export$1391212d75b2ee65 = (t)=>new Promise((resolve)=>setTimeout(resolve, t));
const $93d7a9f3166de761$export$bab98af026af71ac = (value)=>typeof value === "string" && value.startsWith("http") && !/\s/g.test(value);
const $93d7a9f3166de761$export$50ae7fb6f87de989 = (value)=>typeof value === "string" && value.startsWith("/") && !/\s/g.test(value);





const $421a3f9f89d1fa03$var$useGetAppStatus = ()=>{
    const { data: identity } = (0, $iLwJW$useGetIdentity)();
    return (0, $iLwJW$useCallback)(async ()=>{
        const oidcIssuer = new URL(identity?.id).origin;
        const endpointUrl = (0, $iLwJW$urljoin)(oidcIssuer, ".well-known/app-status");
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
var $421a3f9f89d1fa03$export$2e2bcd8739ae039 = $421a3f9f89d1fa03$var$useGetAppStatus;





/**
 * Return a function that look if an app (clientId) is registered with an user (webId)
 * If not, it redirects to the endpoint provided by the user's authorization agent
 * See https://solid.github.io/data-interoperability-panel/specification/#authorization-agent
 */ const $27e56b6748904a8d$var$useRegisterApp = ()=>{
    const dataProvider = (0, $iLwJW$useDataProvider)();
    const registerApp = (0, $iLwJW$useCallback)(async (clientId, webId)=>{
        const { json: actor } = await dataProvider.fetch(webId);
        const authAgentUri = actor["interop:hasAuthorizationAgent"];
        if (authAgentUri) {
            // Find if an application registration is linked to this user
            // See https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery
            const { headers: headers, json: authAgent } = await dataProvider.fetch(authAgentUri);
            const linkHeader = (0, $iLwJW$httplinkheader).parse(headers.get("Link"));
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
var $27e56b6748904a8d$export$2e2bcd8739ae039 = $27e56b6748904a8d$var$useRegisterApp;


/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline or not installed, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 * If the app is not listening to the provided URLs, display an error message
 * Check this every 2 minutes or whenever the window becomes visible again
 */ const $2957839fe06af793$var$BackgroundChecks = ({ clientId: clientId, listeningTo: listeningTo = [], children: children })=>{
    const { data: identity, isLoading: isIdentityLoading } = (0, $iLwJW$useGetIdentity)();
    const dataProvider = (0, $iLwJW$useDataProvider)();
    const translate = (0, $iLwJW$useTranslate)();
    const logout = (0, $iLwJW$useLogout)();
    const [appStatusChecked, setAppStatusChecked] = (0, $iLwJW$useState)(false);
    const [errorMessage, setErrorMessage] = (0, $iLwJW$useState)();
    const nodeinfo = (0, $iLwJW$useNodeinfo)(identity?.id ? new URL(identity?.id).host : undefined);
    const registerApp = (0, $27e56b6748904a8d$export$2e2bcd8739ae039)();
    const getAppStatus = (0, $421a3f9f89d1fa03$export$2e2bcd8739ae039)();
    const redirect = (0, $iLwJW$useRedirect)();
    const isLoggedOut = !isIdentityLoading && !identity?.id;
    if (!clientId) throw new Error(`Missing clientId prop for BackgroundChecks component`);
    const checkAppStatus = (0, $iLwJW$useCallback)(async ()=>{
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
                        for (const uri of listeningTo)if (!(0, $93d7a9f3166de761$export$e57ff0f701c44363)(appStatus.webhookChannels).some((c)=>c.topic === uri)) missingListener = uri;
                        // If one or more listener were not found, wait 1s and refetch the app status endpoint
                        // This happens when the app was just registered, and the webhooks have not been created yet
                        if (missingListener) {
                            numAttempts++;
                            await (0, $93d7a9f3166de761$export$1391212d75b2ee65)(1000);
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
    (0, $iLwJW$useEffect)(()=>{
        if (localStorage.getItem("redirect")) redirect(localStorage.getItem("redirect"));
    }, [
        redirect
    ]);
    (0, $iLwJW$useLayoutEffect)(()=>{
        document.addEventListener("visibilitychange", checkAppStatus);
        return ()=>document.removeEventListener("visibilitychange", checkAppStatus);
    }, [
        checkAppStatus
    ]);
    if (isLoggedOut || appStatusChecked) return children;
    else if (errorMessage) return /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        sx: {
            minHeight: 400
        },
        children: /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$Box), {
            sx: {
                backgroundColor: "red",
                p: 2,
                textAlign: "center"
            },
            children: [
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialError), {
                    sx: {
                        width: 50,
                        height: 50,
                        color: "white"
                    }
                }),
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Typography), {
                    color: "white",
                    children: errorMessage
                }),
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Button), {
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
                /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Button), {
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
    return /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        sx: {
            minHeight: 400
        },
        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$CircularProgress), {
            size: 100,
            thickness: 6,
            sx: {
                mb: 5,
                color: "white"
            }
        })
    });
};
var $2957839fe06af793$export$2e2bcd8739ae039 = $2957839fe06af793$var$BackgroundChecks;












/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */ const $4a72285bffb5f50f$var$LoginPage = ({ text: text, clientId: clientId, customPodProviders: customPodProviders })=>{
    const notify = (0, $iLwJW$useNotify)();
    const [searchParams] = (0, $iLwJW$useSearchParams)();
    const [locale] = (0, $iLwJW$useLocaleState)();
    const login = (0, $iLwJW$useLogin)();
    const logout = (0, $iLwJW$useLogout)();
    const translate = (0, $iLwJW$useTranslate)();
    const redirect = (0, $iLwJW$useRedirect)();
    const { data: identity, isLoading: isIdentityLoading } = (0, $iLwJW$useGetIdentity)();
    const [podProviders, setPodProviders] = (0, $iLwJW$useState)(customPodProviders || []);
    const [isRegistered, setIsRegistered] = (0, $iLwJW$useState)(false);
    const isSignup = searchParams.has("signup");
    const redirectUrl = (0, $93d7a9f3166de761$export$50ae7fb6f87de989)(searchParams.get("redirect")) ? searchParams.get("redirect") : "/";
    const registerApp = (0, $27e56b6748904a8d$export$2e2bcd8739ae039)();
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
            issuer: searchParams.get("iss"),
            redirect: redirectUrl
        });
        else if (searchParams.has("register_app")) {
            // Identity is not available yet because we can't fetch the user profile
            // So get the webId by decoding the token
            const token = localStorage.getItem("token");
            if (token) {
                const payload = (0, $iLwJW$jwtdecode)(token);
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
    (0, $iLwJW$useEffect)(()=>{
        if (!isIdentityLoading && identity?.id && isRegistered) redirect(redirectUrl);
    }, [
        identity,
        isIdentityLoading,
        isRegistered,
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
                                                    redirect: redirectUrl,
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
var $4a72285bffb5f50f$export$2e2bcd8739ae039 = $4a72285bffb5f50f$var$LoginPage;





/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 * This page is called from the data browser in the Pod provider
 */ const $1a88c39afebe872d$var$RedirectPage = ()=>{
    const config = (0, $iLwJW$useDataProviderConfig)();
    const navigate = (0, $iLwJW$useNavigate)();
    const [searchParams] = (0, $iLwJW$useSearchParams)();
    (0, $iLwJW$useEffect)(()=>{
        if (config) {
            const { ontologies: ontologies, resources: resources } = config;
            let resourceId;
            if (searchParams.has("type")) {
                const fullTypeUri = (0, $iLwJW$getUriFromPrefix)(searchParams.get("type"), ontologies);
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
var $1a88c39afebe872d$export$2e2bcd8739ae039 = $1a88c39afebe872d$var$RedirectPage;
























/**
 * @typedef {import("./GroupContactsItem").InvitationState} InvitationState
 */ const $3d109438326dd070$var$useStyles = (0, $iLwJW$muistylesmakeStyles)((theme)=>({
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
 */ const $3d109438326dd070$var$ContactItem = ({ record: record, invitation: invitation, onChange: onChange, isCreator: isCreator })=>{
    const classes = $3d109438326dd070$var$useStyles();
    const translate = (0, $iLwJW$useTranslate)();
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
    return /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$ListItem), {
        className: classes.listItem,
        children: [
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemAvatar), {
                className: classes.avatarItem,
                children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Avatar), {
                    src: record?.["vcard:photo"],
                    className: classes.avatar,
                    children: record["vcard:given-name"]?.[0]
                })
            }),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.primaryText,
                primary: record["vcard:given-name"],
                secondary: (0, $93d7a9f3166de761$export$1b2abdd92765429)(record.describes)
            }),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.view"),
                secondary: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Switch), {
                    size: "small",
                    checked: invitationState.canView || invitationState.canShare,
                    disabled: invitationState.viewReadonly,
                    onClick: changeCanView
                })
            }),
            isCreator && /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.share"),
                secondary: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Switch), {
                    size: "small",
                    checked: invitationState.canShare,
                    disabled: invitationState.shareReadonly,
                    onClick: changeCanShare
                })
            })
        ]
    });
};
var $3d109438326dd070$export$2e2bcd8739ae039 = $3d109438326dd070$var$ContactItem;









/** @typedef {import("./ShareDialog").InvitationState} InvitationState */ const $c78c4dd8a63b7af2$var$useStyles = (0, $iLwJW$muistylesmakeStyles)((theme)=>({
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
 */ const $c78c4dd8a63b7af2$var$GroupContactsItem = ({ group: group, onChange: onChange, invitations: invitations, isCreator: isCreator })=>{
    const classes = $c78c4dd8a63b7af2$var$useStyles();
    const translate = (0, $iLwJW$useTranslate)();
    const groupMemberIds = (0, $93d7a9f3166de761$export$e57ff0f701c44363)(group?.["vcard:hasMember"]);
    const viewChecked = groupMemberIds.every((memberId)=>invitations[memberId]?.canView || invitations[memberId]?.canShare);
    const shareChecked = groupMemberIds.every((memberId)=>invitations[memberId]?.canShare);
    const viewSwitchReadonly = groupMemberIds.every((memberId)=>invitations[memberId]?.viewReadonly || invitations[memberId]?.shareReadonly);
    const shareSwitchReadonly = groupMemberIds.every((memberId)=>invitations[memberId]?.shareReadonly);
    const switchShare = (0, $iLwJW$useCallback)(()=>{
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
    const switchView = (0, $iLwJW$useCallback)(()=>{
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
    return /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$ListItem), {
        className: classes.listItem,
        children: [
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemAvatar), {
                className: classes.avatarItem,
                children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Avatar), {
                    src: group?.["vcard:photo"],
                    className: classes.avatar,
                    children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialGroup), {})
                })
            }),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.primaryText,
                primary: group?.["vcard:label"]
            }),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.view"),
                secondary: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Switch), {
                    size: "small",
                    checked: viewChecked,
                    disabled: viewSwitchReadonly || !group,
                    onClick: switchView
                })
            }),
            isCreator && /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                className: classes.secondaryText,
                primary: translate("apods.permission.share"),
                secondary: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Switch), {
                    size: "small",
                    checked: shareChecked,
                    disabled: shareSwitchReadonly || !group,
                    onClick: switchShare
                })
            })
        ]
    });
};
var $c78c4dd8a63b7af2$export$2e2bcd8739ae039 = $c78c4dd8a63b7af2$var$GroupContactsItem;



/**
 * @typedef {import('./ShareDialog').InvitationState} InvitationState
 */ const $353d7b2d3f8a843f$var$useStyles = (0, $iLwJW$muistylesmakeStyles)((theme)=>({
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
 */ const $353d7b2d3f8a843f$var$ContactsShareList = ({ invitations: invitations, onChange: onChange, organizerUri: organizerUri, isCreator: isCreator, profileResource: profileResource, groupResource: groupResource })=>{
    const classes = $353d7b2d3f8a843f$var$useStyles();
    const translate = (0, $iLwJW$useTranslate)();
    const { data: identity } = (0, $iLwJW$useGetIdentity)();
    const [searchText, setSearchText] = (0, $iLwJW$useState)("");
    const { data: profilesData, isLoading: loadingProfiles } = (0, $iLwJW$useGetList)(profileResource, {
        pagination: {
            page: 1,
            perPage: 1000
        },
        sort: {
            field: "vcard:given-name",
            order: "ASC"
        }
    });
    const { data: groupsData, isLoading: loadingGroups } = (0, $iLwJW$useGetList)(groupResource, {
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
    const profilesFiltered = (0, $iLwJW$useMemo)(()=>profilesData?.filter((profile)=>profile.describes !== organizerUri && profile.describes !== identity?.id).filter((profile)=>(profile["vcard:given-name"] || "").toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) || (0, $93d7a9f3166de761$export$1b2abdd92765429)(profile.describes).toLocaleLowerCase().includes(searchText.toLocaleLowerCase())), [
        profilesData,
        searchText,
        organizerUri,
        identity
    ]);
    const groupsFiltered = (0, $iLwJW$useMemo)(()=>{
        return groupsData?.filter((group)=>(group["vcard:label"] || "").toLocaleLowerCase().includes(searchText.toLocaleLowerCase()));
    }, [
        groupsData,
        searchText
    ]);
    return /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$List), {
        dense: true,
        className: classes.list,
        children: [
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$TextField), {
                type: "search",
                value: searchText,
                onChange: (event)=>setSearchText(event.target.value),
                label: translate("apods.action.search"),
                fullWidth: true,
                size: "small",
                margin: "dense"
            }),
            groupsFiltered?.map((group)=>/*#__PURE__*/ (0, $iLwJW$jsx)((0, $c78c4dd8a63b7af2$export$2e2bcd8739ae039), {
                    group: group,
                    invitations: invitations,
                    onChange: onChange,
                    isCreator: isCreator
                }, group.id)),
            profilesFiltered?.map((profile)=>/*#__PURE__*/ (0, $iLwJW$jsx)((0, $3d109438326dd070$export$2e2bcd8739ae039), {
                    record: profile,
                    invitation: invitations[profile.describes],
                    onChange: onChange,
                    isCreator: isCreator
                }, profile.id)),
            (loadingProfiles || loadingGroups) && /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Box), {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 250,
                children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$CircularProgress), {
                    size: 60,
                    thickness: 6
                })
            }),
            !loadingProfiles && (profilesFiltered?.length, false)
        ]
    });
};
var $353d7b2d3f8a843f$export$2e2bcd8739ae039 = $353d7b2d3f8a843f$var$ContactsShareList;


/**
 * @typedef InvitationState
 * @property {boolean} canView
 * @property {boolean} canShare
 * @property {boolean} viewReadonly
 * @property {boolean} shareReadonly
 */ const $79f089d541db8101$var$useStyles = (0, $iLwJW$muistylesmakeStyles)((theme)=>({
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
const $79f089d541db8101$var$ShareDialog = ({ close: close, resourceUri: resourceUri, profileResource: profileResource = "Profile", groupResource: groupResource = "Group" })=>{
    const classes = $79f089d541db8101$var$useStyles();
    const { data: identity } = (0, $iLwJW$useGetIdentity)();
    const record = (0, $iLwJW$useRecordContext)();
    const translate = (0, $iLwJW$useTranslate)();
    const creatorUri = record?.["dc:creator"];
    const isCreator = creatorUri && creatorUri === identity?.id;
    const { items: announces } = (0, $iLwJW$useCollection)(record?.["apods:announces"]);
    const { items: announcers } = (0, $iLwJW$useCollection)(isCreator ? record?.["apods:announcers"] : undefined);
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [invitations, setInvitations] = (0, $iLwJW$useState)({});
    // To keep track of changes...
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [newInvitations, setNewInvitations] = (0, $iLwJW$useState)({});
    /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */ const [savedInvitations, setSavedInvitations] = (0, $iLwJW$useState)({});
    const [sendingInvitation, setSendingInvitation] = (0, $iLwJW$useState)(false);
    const xs = (0, $iLwJW$useMediaQuery)((theme)=>theme.breakpoints.down("xs"), {
        noSsr: true
    });
    const outbox = (0, $iLwJW$useOutbox)();
    const notify = (0, $iLwJW$useNotify)();
    // To begin, populate present invitations.
    // Announcers and announces that are already in the collection are readonly.
    (0, $iLwJW$useEffect)(()=>{
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
    /** @param {Record<string, InvitationState} changedRights */ const onChange = (0, $iLwJW$useCallback)((changedRights)=>{
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
    const sendInvitations = (0, $iLwJW$useCallback)(async ()=>{
        setSendingInvitation(true);
        const actorsWithNewViewRight = Object.keys(newInvitations).filter((actorUri)=>newInvitations[actorUri].canView && !savedInvitations[actorUri]?.canView);
        if (actorsWithNewViewRight.length > 0) {
            if (isCreator) outbox.post({
                type: (0, $iLwJW$ACTIVITY_TYPES).ANNOUNCE,
                actor: outbox.owner,
                object: resourceUri,
                target: actorsWithNewViewRight,
                to: actorsWithNewViewRight
            });
            else // Offer the organizer to invite these people
            outbox.post({
                type: (0, $iLwJW$ACTIVITY_TYPES).OFFER,
                actor: outbox.owner,
                object: {
                    type: (0, $iLwJW$ACTIVITY_TYPES).ANNOUNCE,
                    actor: outbox.owner,
                    object: resourceUri,
                    target: actorsWithNewViewRight
                },
                target: record["dc:creator"],
                to: record["dc:creator"]
            });
        }
        const actorsWithNewShareRight = Object.keys(newInvitations).filter((actorUri)=>newInvitations[actorUri].canShare);
        if (actorsWithNewShareRight.length > 0) outbox.post({
            type: (0, $iLwJW$ACTIVITY_TYPES).OFFER,
            actor: outbox.owner,
            object: {
                type: (0, $iLwJW$ACTIVITY_TYPES).ANNOUNCE,
                object: resourceUri
            },
            target: actorsWithNewShareRight,
            to: actorsWithNewShareRight
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
    return /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$Dialog), {
        fullWidth: !xs,
        open: true,
        onClose: close,
        classes: {
            paper: classes.dialogPaper
        },
        children: [
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$DialogTitle), {
                className: classes.title,
                children: translate("apods.action.share")
            }),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$DialogContent), {
                className: classes.listForm,
                children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $353d7b2d3f8a843f$export$2e2bcd8739ae039), {
                    invitations: invitations,
                    onChange: onChange,
                    organizerUri: creatorUri,
                    isCreator: isCreator,
                    profileResource: profileResource,
                    groupResource: groupResource
                })
            }),
            /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$DialogActions), {
                className: classes.actions,
                children: [
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Button), {
                        variant: "text",
                        size: "medium",
                        onClick: close,
                        children: translate("ra.action.close")
                    }),
                    Object.keys(newInvitations).length > 0 && /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Button), {
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
var $79f089d541db8101$export$2e2bcd8739ae039 = $79f089d541db8101$var$ShareDialog;


/**
 * Allow to share the record in the current RecordContext
 * Use the `Announce` and `Offer > Announce` activities handled by ActivityPods
 */ const $47fb439769024aa7$var$ShareButton = ({ profileResource: profileResource = "Profile", groupResource: groupResource = "Group" })=>{
    const [shareOpen, setShareOpen] = (0, $iLwJW$useState)(false);
    const record = (0, $iLwJW$useRecordContext)();
    const { error: error, isLoading: isLoading } = (0, $iLwJW$useCollection)(record?.["apods:announces"]);
    const translate = (0, $iLwJW$useTranslate)();
    // If the user can see the list of announces, it means he can share
    if (!isLoading && !error) return /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$Fragment1), {
        children: [
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Button1), {
                label: translate("apods.action.share"),
                onClick: ()=>setShareOpen(true),
                children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialShare), {})
            }),
            shareOpen && /*#__PURE__*/ (0, $iLwJW$jsx)((0, $79f089d541db8101$export$2e2bcd8739ae039), {
                resourceUri: record.id,
                close: ()=>setShareOpen(false),
                profileResource: profileResource,
                groupResource: groupResource
            })
        ]
    });
    else return null;
};
var $47fb439769024aa7$export$2e2bcd8739ae039 = $47fb439769024aa7$var$ShareButton;





// Set the app locale to the user's locale, if it is set
const $e3472ca7f9a4764c$var$SyncUserLocale = ()=>{
    const [locale, setLocale] = (0, $iLwJW$useLocaleState)();
    const { data: identity } = (0, $iLwJW$useGetIdentity)();
    (0, $iLwJW$useEffect)(()=>{
        if (identity?.webIdData?.["schema:knowsLanguage"] && identity?.webIdData?.["schema:knowsLanguage"] !== locale) setLocale(identity?.webIdData?.["schema:knowsLanguage"]);
    }, [
        locale,
        setLocale,
        identity
    ]);
};
var $e3472ca7f9a4764c$export$2e2bcd8739ae039 = $e3472ca7f9a4764c$var$SyncUserLocale;












const $f86de5ead054b96d$var$UserMenu = ()=>{
    const { data: identity } = (0, $iLwJW$useGetIdentity)();
    const nodeinfo = (0, $iLwJW$useNodeinfo)(identity?.webIdData?.["solid:oidcIssuer"] && new URL(identity?.webIdData?.["solid:oidcIssuer"]).host);
    const translate = (0, $iLwJW$useTranslate)();
    if (identity?.id && !nodeinfo) return null;
    return /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$UserMenu), {
        children: identity?.id ? [
            /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$MenuItem), {
                component: "a",
                href: (0, $iLwJW$urljoin)(nodeinfo?.metadata?.frontend_url, "network"),
                children: [
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemIcon), {
                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialPeopleAlt), {})
                    }),
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                        children: translate("apods.user_menu.network")
                    })
                ]
            }, "network"),
            /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$MenuItem), {
                component: "a",
                href: (0, $iLwJW$urljoin)(nodeinfo?.metadata?.frontend_url, "apps"),
                children: [
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemIcon), {
                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialApps), {})
                    }),
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                        children: translate("apods.user_menu.apps")
                    })
                ]
            }, "apps"),
            /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$MenuItem), {
                component: "a",
                href: (0, $iLwJW$urljoin)(nodeinfo?.metadata?.frontend_url, "data"),
                children: [
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemIcon), {
                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialStorage), {})
                    }),
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                        children: translate("apods.user_menu.data")
                    })
                ]
            }, "data"),
            /*#__PURE__*/ (0, $iLwJW$jsxs)((0, $iLwJW$MenuItem), {
                component: "a",
                href: (0, $iLwJW$urljoin)(nodeinfo?.metadata?.frontend_url, "settings"),
                children: [
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemIcon), {
                        children: /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$muiiconsmaterialSettings), {})
                    }),
                    /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$ListItemText), {
                        children: translate("apods.user_menu.settings")
                    })
                ]
            }, "settings"),
            /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$Logout), {}, "logout")
        ] : /*#__PURE__*/ (0, $iLwJW$jsx)((0, $iLwJW$MenuItemLink), {
            to: "/login",
            primaryText: translate("ra.auth.sign_in")
        })
    });
};
var $f86de5ead054b96d$export$2e2bcd8739ae039 = $f86de5ead054b96d$var$UserMenu;


// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts
var $4b2a6afceae7f301$export$2e2bcd8739ae039 = {
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
var $5de716308b366acb$export$2e2bcd8739ae039 = {
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




export {$2957839fe06af793$export$2e2bcd8739ae039 as BackgroundChecks, $4a72285bffb5f50f$export$2e2bcd8739ae039 as LoginPage, $1a88c39afebe872d$export$2e2bcd8739ae039 as RedirectPage, $47fb439769024aa7$export$2e2bcd8739ae039 as ShareButton, $79f089d541db8101$export$2e2bcd8739ae039 as ShareDialog, $e3472ca7f9a4764c$export$2e2bcd8739ae039 as SyncUserLocale, $f86de5ead054b96d$export$2e2bcd8739ae039 as UserMenu, $4b2a6afceae7f301$export$2e2bcd8739ae039 as englishMessages, $5de716308b366acb$export$2e2bcd8739ae039 as frenchMessages};
//# sourceMappingURL=index.es.js.map
