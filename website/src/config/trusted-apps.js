export default [
	{
		'@type': 'apods:TrustedApps',
		'apods:name': 'Welcome to my place',
		'apods:description':
			'Private meetings at home that promote a living together based on welcome, trust and mutual aid.',
		'apods:domainName': 'welcometomyplace.org',
		'apods:handledTypes': 'https://www.w3.org/ns/activitystreams#Event',
		'apods:locales': 'en',
		'apods:logo': 'https://welcometomyplace.org/logo512.png',
		'apods:sourceCode': 'https://github.com/assemblee-virtuelle/welcometomyplace',
	},
	{
		'@type': 'apods:TrustedApps',
		'apods:name': 'Mutual Aid',
		'apods:description': 'Classified ads oriented around mutual aid and shareable within a trusted network.',
		'apods:domainName': 'mutual-aid.app',
		'apods:handledTypes': [
			'http://virtual-assembly.org/ontologies/pair-mp#Request',
			'http://virtual-assembly.org/ontologies/pair-mp#Offer',
		],
		'apods:locales': 'en',
		'apods:logo': 'https://mutual-aid.app/logo512.png',
		'apods:sourceCode': 'https://github.com/assemblee-virtuelle/mutual-aid.app',
	},
	{
		'@type': 'apods:TrustedApps',
		'apods:name': 'Bienvenue chez moi',
		'apods:description':
			'Rencontres privées à domicile qui favorisent un vivre ensemble basé sur l’accueil, la confiance et l’entraide.',
		'apods:domainName': 'bienvenuechezmoi.org',
		'apods:handledTypes': 'https://www.w3.org/ns/activitystreams#Event',
		'apods:locales': 'fr',
		'apods:logo': 'https://bienvenuechezmoi.org/logo512.png',
		'apods:sourceCode': 'https://github.com/assemblee-virtuelle/welcometomyplace',
	},
	{
		'@type': 'apods:TrustedApps',
		'apods:name': "L'Entraide",
		'apods:description':
			"Petites annonces orientées autour de l'entraide et partageables au sein d'un réseau de confiance.",
		'apods:domainName': 'lentraide.app',
		'apods:handledTypes': [
			'http://virtual-assembly.org/ontologies/pair-mp#Request',
			'http://virtual-assembly.org/ontologies/pair-mp#Offer',
		],
		'apods:locales': 'fr',
		'apods:logo': 'https://lentraide.app/logo512.png',
		'apods:sourceCode': 'https://github.com/assemblee-virtuelle/mutual-aid.app',
	},
];
