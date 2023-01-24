import ldpContainer from "~/utils/ldpContainer";
import trustedApps from "~/config/trusted-apps";

export async function get({params, request}) {
	const headers = new Headers({
		'Content-Type': 'application/json'
	});
	return new Response(
		JSON.stringify(ldpContainer(
			request.url,
			trustedApps,
			"apods:domainName"
		)),
		{
			status: 200,
			statusText: 'OK',
			headers
		}
	);
}
