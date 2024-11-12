import { useEffect } from 'react';
import { useGetIdentity, useLocaleState } from 'react-admin';

// Set the app locale to the user's locale, if it is set
const UpdateLocale = () => {
  const [locale, setLocale] = useLocaleState();
  const { data: identity } = useGetIdentity();

  useEffect(() => {
    if (identity?.webIdData?.['schema:knowsLanguage'] && identity?.webIdData?.['schema:knowsLanguage'] !== locale) {
      setLocale(identity?.webIdData?.['schema:knowsLanguage']);
    }
  }, [locale, setLocale, identity]);
};

export default UpdateLocale;
