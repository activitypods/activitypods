import { FunctionComponent, ReactNode } from "react";
type Ontology = {
    prefix: string;
    owl?: string;
    url: string;
};
type PodProvider = {
    id?: string;
    type?: string;
    'apods:baseUrl': string;
    'apods:area'?: string;
    'apods:locales'?: string;
    'apods:providedBy'?: string;
};
/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline or not installed, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 * If the app is not listening to the provided URLs, display an error message
 * Check this every 2 minutes or whenever the window becomes visible again
 */
export const BackgroundChecks: FunctionComponent<Props>;
type Props = {
    clientId: string;
    listeningTo?: string[];
    children: ReactNode;
};
/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */
export const LoginPage: FunctionComponent<_Props1>;
type _Props1 = {
    text?: string;
    clientId: string;
    customPodProviders: [PodProvider];
};
/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 * This page is called from the data browser in the Pod provider
 */
export const RedirectPage: FunctionComponent<_Props2>;
type _Props2 = {
    ontologies: [Ontology];
};
export const SyncUserLocale: () => void;
export const UserMenu: FunctionComponent;
export const englishMessages: {
    apods: {
        action: {
            search: string;
            share: string;
            send_invitation: string;
        };
        helper: {
            no_contact: string;
        };
        notification: {
            invitation_sent: string;
        };
        permission: {
            view: string;
            share: string;
        };
        error: {
            app_status_unavailable: string;
            app_offline: string;
            app_not_installed: string;
            app_not_listening: string;
        };
        user_menu: {
            network: string;
            apps: string;
            data: string;
            settings: string;
        };
    };
};
export const frenchMessages: {
    apods: {
        action: {
            search: string;
            send_invitation: string;
            share: string;
        };
        helper: {
            no_contact: string;
        };
        notification: {
            invitation_sent: string;
        };
        permission: {
            view: string;
            share: string;
        };
        error: {
            app_status_unavailable: string;
            app_offline: string;
            app_not_installed: string;
            app_not_listening: string;
        };
        user_menu: {
            network: string;
            apps: string;
            data: string;
            settings: string;
        };
    };
};
export { default as ShareButton } from './components/ShareButton/ShareButton';
export { default as ShareDialog } from './components/ShareButton/ShareDialog';

//# sourceMappingURL=index.d.ts.map
