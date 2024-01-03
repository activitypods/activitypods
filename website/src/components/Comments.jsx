import * as React from 'react';
import Giscus from '@giscus/react';

const id = 'inject-comments';

const Comments = () => {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setTheme] = React.useState('light');

  React.useEffect(() => {
    setMounted(true);
    if (localStorage) setTheme(localStorage.getItem('theme'));
  }, [setMounted, setTheme]);

  return (
    <section className="pb-12 px-6 mx-auto max-w-3xl">
      <div id={id}>
        {mounted ? (
          <Giscus
            id={id}
            repo="assemblee-virtuelle/activitypods"
            repoId="R_kgDOGejTbQ"
            category="Blog articles"
            categoryId="DIC_kwDOGejTbc4CcKru"
            mapping="og:title"
            reactionsEnabled="0"
            emitMetadata="0"
            inputPosition="top"
            theme={theme}
            lang="en"
            loading="lazy"
          />
        ) : null}
      </div>
    </section>
  );
};

export default Comments;
