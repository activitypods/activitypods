export default (url, resources, slug) => ({
    "@context": {
        apods: "http://activitypods.org/ns/core#",
        ldp: "http://www.w3.org/ns/ldp#",
    },
    "@id": url,
    "@type": ["ldp:Container","ldp:BasicContainer"],
    "ldp:contains": [resources.map(resource => ({
        '@id': url + '/' + resource[slug],
        ...resource,
    }))]
});
