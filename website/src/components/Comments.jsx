import * as React from 'react';
import Giscus from '@giscus/react';

const id = 'inject-comments';

const Comments = () => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
            theme="light"
            lang="en"
            loading="lazy"
          />
        ) : null}
      </div>
    </section>
  );
};

export default Comments;
