import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.activitypods.org',
  integrations: [
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
        mastodon: 'https://fosstodon.org/@activitypods'
      },
      sidebar: [
        {
          label: 'Tutorials',
          autogenerate: { directory: 'tutorials' }
        },
        {
          label: 'App framework',
          items: [
            {
              label: 'Introduction',
              link: 'app-framework/introduction'
            },
            {
              label: 'Backend',
              autogenerate: { directory: 'app-framework/backend' }
            },
            {
              label: 'Frontend',
              autogenerate: { directory: 'app-framework/frontend' }
            }
          ]
        },
        {
          label: 'Pods architecture',
          autogenerate: { directory: 'architecture' }
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' }
        }
      ],
      components: {
        Hero: './src/components/Hero.astro'
      }
    })
  ]
});
