import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.activitypods.org',
  redirects: {
    '/reference/pod-activities-watcher-service': '/reference/backend/pod-activities-watcher-service',
    '/reference/pod-collections-service': '/reference/backend/pod-collections-service',
    '/reference/pod-notification-service': '/reference/backend/pod-notification-service',
    '/reference/pod-outbox-service': '/reference/backend/pod-outbox-service',
    '/reference/pod-permissions-service': '/reference/backend/pod-permissions-service',
    '/reference/pod-resources-service': '/reference/backend/pod-resources-service',
    '/reference/pod-wac-groups-service': '/reference/backend/pod-wac-groups-service'
  },
  integrations: [
    // Must be before Starlight, otherwise mermaid code blocks are handled by Expressive Code
    mermaid(),
    starlight({
      title: 'Docs',
      logo: {
        src: './src/assets/full-logo.png'
      },
      customCss: ['@fontsource/pt-sans/400.css', '@fontsource/pt-sans/700.css', './src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/assemblee-virtuelle/activitypods/edit/master/docs/'
      },
      social: {
        github: 'https://github.com/assemblee-virtuelle/activitypods',
        mastodon: 'https://fosstodon.org/@activitypods',
        matrix: 'https://matrix.to/#/#activitypods:matrix.org'
      },
      sidebar: [
        {
          label: 'Key concepts',
          link: '/key-concepts/'
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' }
        },
        {
          label: 'App framework',
          items: [
            {
              label: 'Backend',
              autogenerate: { directory: 'app-framework/backend' }
            },
            {
              label: 'Frontend',
              autogenerate: { directory: 'app-framework/frontend' }
            },
            {
              label: 'Contacts and sharing',
              link: '/app-framework/contacts-and-sharing/'
            }
          ]
        },
        {
          label: 'Pods architecture',
          autogenerate: { directory: 'architecture' }
        },
        {
          label: 'Reference',
          items: [
            {
              label: 'Backend',
              autogenerate: { directory: 'reference/backend' }
            },
            {
              label: 'Frontend',
              autogenerate: { directory: 'reference/frontend' }
            }
          ]
        }
      ],
      components: {
        Hero: './src/components/Hero.astro'
      }
    })
  ]
});
