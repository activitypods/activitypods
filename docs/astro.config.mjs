import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.activitypods.org',
  integrations: [
    starlight({
      title: 'DOCS',
      logo: {
        src: './src/assets/logo.svg'
      },
      editLink: {
        baseUrl: 'https://github.com/assemblee-virtuelle/activitypods/edit/master/docs/'
      },
      social: {
        github: 'https://github.com/assemblee-virtuelle/activitypods',
        mastodon: 'https://fosstodon.org/@activitypods'
      },
      sidebar: [
        {
          label: 'Tutorials',
          autogenerate: { directory: 'tutorials' }
        },
        {
          label: 'App backend',
          autogenerate: { directory: 'backend' }
        },
        {
          label: 'App frontend',
          autogenerate: { directory: 'frontend' }
        },
        {
          label: 'Design',
          autogenerate: { directory: 'design' }
        }
      ],
      components: {
        Hero: './src/components/Hero.astro'
      }
    })
  ]
});
