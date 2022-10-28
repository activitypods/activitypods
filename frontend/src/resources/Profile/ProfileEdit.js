import React from 'react';
import {EditBase, linkToRecord, useTranslate} from 'react-admin';
import EditPage from '../../layout/EditPage';
import ProfileForm from './ProfileForm';

export const ProfileEdit = (props) => {
  const translate = useTranslate();
  return (
    <EditBase {...props} transform={(data) => ({ ...data, 'vcard:fn': data['vcard:given-name'] })}>
      <EditPage
        title={translate('app.page.profile')}
        hasDelete={false}
        actions={{[linkToRecord('/Profile', props.id, 'show')]: translate('ra.action.show')}}
      >
        <ProfileForm />
      </EditPage>
    </EditBase>
  );
};

export default ProfileEdit;
