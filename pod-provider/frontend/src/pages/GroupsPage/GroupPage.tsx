import React from 'react';
import { useTranslate, Button, DateField, RecordContextProvider, ResourceContextProvider } from 'react-admin';
import { Link } from 'react-router-dom';
import { Typography } from '@mui/material';
import ListIcon from '@mui/icons-material/List';
import Header from '../../common/Header';
import Hero from '../../common/list/Hero/Hero';
import ShowView from '../../layout/ShowView';
import ValueField from '../../common/fields/ValueField';
import { useGroup } from '../../hooks/useGroups';
import useRoleLabel from '../../hooks/useRoleLabel';
import GroupCard from './GroupCard';

const GroupPage = ({ groupUri }: { groupUri: string }) => {
  const translate = useTranslate();
  const roleLabel = useRoleLabel();
  const { group, isLoading } = useGroup(groupUri);

  if (isLoading) return null;
  if (!group) return <Typography sx={{ mt: 2 }}>{translate('app.helper.group_not_found')}</Typography>;

  return (
    <>
      <Header title="app.titles.my_groups" />
      <ShowView
        title={group.name}
        actions={[
          <Button component={Link} to="/network/groups" label="ra.action.list">
            <ListIcon />
          </Button>
        ]}
        asides={[<GroupCard group={group} />]}
      >
        <ResourceContextProvider value="Actor">
          <RecordContextProvider value={group.webIdData}>
            <Hero image={group.avatar}>
              <ValueField value={group.name} label={translate('app.group.name')} />
              <ValueField value={group.webfingerId} label={translate('app.group.id')} />
              <ValueField value={group.summary} label={translate('resources.Profile.fields.vcard:note')} />
              <DateField
                source="dc:created"
                label={translate('app.input.created')}
                locales={CONFIG.DEFAULT_LOCALE}
                options={{ month: 'long', day: 'numeric', year: 'numeric' }}
              />
              <ValueField
                value={group.rights.roles.map(role => roleLabel(role as any)).join(', ')}
                label={translate('app.group.my_roles')}
              />
            </Hero>
          </RecordContextProvider>
        </ResourceContextProvider>
      </ShowView>
    </>
  );
};

export default GroupPage;
