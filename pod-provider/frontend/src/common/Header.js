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

  return (
    <Helmet>
      <title>{translatedTitle}</title>
      {keywords && <meta name="keywords" content={keywords} />}
      {description && <meta name="description" content={description} />}
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
