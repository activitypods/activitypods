import ldpContainer from "~/utils/ldpContainer";
import podProviders from "~/config/pod-providers";

export async function get({params, request}) {
	return new Response(
		JSON.stringify(ldpContainer(
			request.url,
			podProviders,
			"apods:domainName"
		)), 
		{
			headers: {
				'Content-Type': 'application/ld+json'
		}
	});
}
