import React, { useEffect, useState } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useTranslate, useGetList, useAuthProvider, useNotify, useLocaleState } from 'react-admin';
import { Box, Typography, List } from '@mui/material';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { useNavigate } from 'react-router-dom';
import EmailIcon from '@mui/icons-material/Email';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import LockIcon from '@mui/icons-material/Lock';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import GavelIcon from '@mui/icons-material/Gavel';
import LinkIcon from '@mui/icons-material/Link';
import TuneIcon from '@mui/icons-material/Tune';
import TranslateIcon from '@mui/icons-material/Translate';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import AppsIcon from '@mui/icons-material/Apps';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import ViewListIcon from '@mui/icons-material/ViewList';
import Header from '../../common/Header';
import useContactLink from '../../hooks/useContactLink';
import SettingsItem from './SettingsItem';
import { availableLocales } from '../../config/i18nProvider';

const SettingsOwnerDashboardPage = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  const authProvider = useAuthProvider();
  const navigate = useNavigate();
  const [locale] = useLocaleState();
  const notify = useNotify();
  const [accountSettings, setAccountSettings] = useState({});

  const { data } = useGetList('Location');
  const { contactLink, status: contactLinkStatus } = useContactLink();

  useEffect(() => {
    authProvider.getAccountSettings().then(res => setAccountSettings(res));
  }, [setAccountSettings, authProvider]);

  return (
    <>
      <Header title="app.titles.settings" />
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        Pod owner dashboard
      </Typography>
      <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
        Manage your account, profile, and app access.
      </Typography>
      <Box>
        <List>
          <Typography variant="overline" color="text.secondary" sx={{ pl: 2, pt: 1 }}>
            Account
          </Typography>
          <SettingsItem
            onClick={() => navigate('/settings/profiles')}
            icon={<PersonIcon />}
            label="app.setting.profiles"
            value={translate('app.setting.profile', { smart_count: 2 })}
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/Location')}
            icon={<PlaceIcon />}
            label="app.setting.addresses"
            value={translate('app.setting.address', { smart_count: data ? data.length : 0 })}
          />
          <SettingsItem
            onClick={() => navigate('/settings/email')}
            icon={<EmailIcon />}
            label="app.setting.email"
            value={accountSettings.email}
          />
          <SettingsItem
            onClick={() => navigate('/settings/password')}
            icon={<LockIcon />}
            label="app.setting.password"
            value="***************"
          />
          <SettingsItem
            onClick={() => navigate('/settings/atproto-link')}
            icon={<AccountTreeIcon />}
            label="app.setting.atproto_link"
            value={translate('app.setting.atproto_link_description')}
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/locale')}
            icon={<TranslateIcon />}
            label="app.setting.locale"
            value={availableLocales.find(l => l.locale === locale)?.name}
          />
          <CopyToClipboard text={contactLinkStatus === 'loaded' ? contactLink : undefined}>
            <SettingsItem
              onClick={() =>
                contactLinkStatus === 'loaded' && notify('app.notification.contact_link_copied', { type: 'success' })
              }
              icon={<LinkIcon />}
              label="app.card.share_contact"
              value={
                (contactLinkStatus === 'loaded' && contactLink) ||
                translate(
                  (contactLinkStatus === 'loading' && 'app.message.loading_invite_link') ||
                    (contactLinkStatus === 'error' && 'app.message.loading_invite_link_failed')
                )
              }
              actionIcon={<FileCopyIcon />}
            />
          </CopyToClipboard>

          <Typography variant="overline" color="text.secondary" sx={{ pl: 2, pt: 1 }}>
            Moderation
          </Typography>
          <SettingsItem
            onClick={() => navigate('/settings/moderation')}
            icon={<ViewListIcon />}
            label="Moderation lists"
            value="Muted accounts, blocked accounts, public sharing"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/moderation/reports')}
            icon={<GavelIcon />}
            label="Reports & actions"
            value="Reports you filed, cross-protocol delivery, actions affecting you"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/moderation/rules')}
            icon={<GavelIcon />}
            label="Moderation rules"
            value="Keyword filters, sensitive media, ATProto sync, monthly summary"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/apps')}
            icon={<AppsIcon />}
            label="app.setting.app_permissions"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/advanced')}
            icon={<TuneIcon />}
            label="app.page.settings_advanced"
            actionIcon={<ArrowForwardIosIcon />}
          />
        </List>
      </Box>
    </>
  );
};

export default SettingsOwnerDashboardPage;
