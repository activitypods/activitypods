import ldpContainer from "~/utils/ldpContainer";
import podProviders from "~/config/pod-providers";

export async function get({params, request}) {
    return {
        body: JSON.stringify(ldpContainer(
            request.url, 
            podProviders, 
            "apods:domainName"
        )),
    };
}