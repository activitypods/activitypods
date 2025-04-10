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
    async params => {
      try {
        await dataProvider.update('Actor', {
          id: identity.id,
          data: {
            ...identity.webIdData,
            'schema:knowsLanguage': params.locale
          },
          previousData: identity.webIdData
        });
        // Refetch the webId, so that frontend locale is automatically updated (through UpdateLocale component)
        await refetch();
        notify('app.notification.locale_changed', { type: 'success' });
      } catch (error) {
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
