import React, { useCallback } from 'react';
import {
  useNotify,
  useTranslate,
  SimpleForm,
  RadioButtonGroupInput,
  useLocaleState,
  useDataProvider,
  useGetIdentity
} from 'react-admin';
import { Box, Card, Typography } from '@mui/material';
import { availableLocales } from '../../config/i18nProvider';

const SettingsLocalePage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { data: identity, refetch } = useGetIdentity();
  const [locale] = useLocaleState();

  const onSubmit = useCallback(
    async (params: any) => {
      try {
        await dataProvider.update('Actor', {
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          id: identity.id,
          data: {
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            ...identity.webIdData,
            'schema:knowsLanguage': params.locale
          },
          // @ts-expect-error TS(2532): Object is possibly 'undefined'.
          previousData: identity.webIdData
        });
        // Refetch the webId, so that frontend locale is automatically updated (through UpdateLocale component)
        // @ts-expect-error TS(2722): Cannot invoke an object which is possibly 'undefin... Remove this comment to see the full error message
        await refetch();
        notify('app.notification.locale_changed', { type: 'success' });
      } catch (error) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        notify(error.message, { type: 'error' });
      }
    },
    [identity, dataProvider, refetch, notify]
  );

  if (!identity?.id) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings_locale')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm defaultValues={{ locale }} onSubmit={onSubmit}>
            <RadioButtonGroupInput
              label={false}
              helperText={false}
              source="locale"
              choices={availableLocales}
              optionValue="locale"
              options={{ row: false }}
              sx={{ pl: 0.5 }}
            />
          </SimpleForm>
        </Card>
      </Box>
    </>
  );
};

export default SettingsLocalePage;
