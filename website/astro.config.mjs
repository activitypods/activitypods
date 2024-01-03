import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, squooshImageService } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import icon from 'astro-icon';
import tasks from './src/utils/tasks';

import remarkToc from 'remark-toc';
import rehypeToc from 'rehype-toc';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import rehypeExternalLinks from 'rehype-external-links';

import { readingTimeRemarkPlugin, responsiveTablesRehypePlugin } from './src/utils/frontmatter.mjs';

import { ANALYTICS, SITE } from './src/utils/config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const whenExternalScripts = (items = []) =>
  ANALYTICS.vendors.googleAnalytics.id && ANALYTICS.vendors.googleAnalytics.partytown
    ? Array.isArray(items)
      ? items.map((item) => item())
      : [items()]
    : [];

export default defineConfig({
  site: SITE.site,
  base: SITE.base,
  trailingSlash: SITE.trailingSlash ? 'always' : 'never',

  output: 'static',

  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap(),
    mdx(),
    icon({
      include: {
        tabler: ['*'],
        ic: ['*'],
        'flat-color-icons': ['*'],
        'eos-icons': ['proxy-outlined'],
        bi: ['mailbox'],
      },
    }),

    ...whenExternalScripts(() =>
      partytown({
        config: { forward: ['dataLayer.push'] },
      })
    ),

    tasks(),
  ],

  image: {
    service: squooshImageService(),
  },

  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin, remarkToc],
    rehypePlugins: [
      responsiveTablesRehypePlugin,
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'append' }],
      [
        rehypeToc,
        {
          headings: ['h1', 'h2', 'h3', 'h4'],
          cssClasses: {
            toc: 'toc-post',
            link: 'toc-link',
          },
        },
      ],
      [
        rehypeExternalLinks,
        {
          target: '_blank',
        },
      ],
    ],
    shikiConfig: {
      // theme: 'github-light',
      experimentalThemes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },

  vite: {
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
