import ldpContainer from "~/utils/ldpContainer";
import trustedApps from "~/config/trusted-apps";

export async function get({params, request}) {
    return {
        body: JSON.stringify(ldpContainer(
            request.url, 
            trustedApps, 
            "apods:domainName"
        )),
    };
}