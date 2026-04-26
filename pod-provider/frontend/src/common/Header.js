import React from 'react';
import { Helmet } from 'react-helmet';
import { useTranslate } from 'react-admin';
import PropTypes from 'prop-types';

/**
 * Header component that manages page metadata using react-helmet
 * @param {Object} props
 * @param {string} props.title - The page title to be translated
 * @param {Object} [props.titleVariables] - Variables to be passed to the title translation
 * @param {string} [props.keywords] - Meta keywords for SEO
 * @param {string} [props.description] - Meta description for SEO
 */
const Header = ({ title, titleVariables, keywords, description }) => {
  const translate = useTranslate();

  const translatedTitle = React.useMemo(() => {
    const translatedTitle = translate(title, {
      appName: CONFIG.INSTANCE_NAME,
      ...titleVariables
    });
    return translatedTitle;
  }, [title, titleVariables, translate]);

  const defaultDescription = React.useMemo(
    () => `${CONFIG.INSTANCE_NAME} is a federated social platform powered by ActivityPub and personal pods.`,
    []
  );
  const effectiveDescription = description || defaultDescription;
  const currentUrl = typeof window !== 'undefined' ? window.location.href : undefined;

  return (
    <Helmet>
      <title>{translatedTitle}</title>
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="description" content={effectiveDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={CONFIG.INSTANCE_NAME} />
      <meta property="og:title" content={translatedTitle} />
      <meta property="og:description" content={effectiveDescription} />
      {currentUrl && <meta property="og:url" content={currentUrl} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={translatedTitle} />
      <meta name="twitter:description" content={effectiveDescription} />
    </Helmet>
  );
};

Header.propTypes = {
  title: PropTypes.string.isRequired,
  keywords: PropTypes.string,
  description: PropTypes.string
};

Header.defaultProps = {
  keywords: '',
  description: ''
};

export default Header;
