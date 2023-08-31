import React from 'react';
import { redirect, useParams } from 'react-router-dom';
import { useGetIdentity, useNotify, useTranslate } from 'react-admin';

const UserPage = () => {
  const params = useParams();
  const { identity, loaded: userLoaded } = useGetIdentity();
  const translate = useTranslate();
  const notify = useNotify();

  // const webfinger = useWebfinger();
  // const [ isContact, setIsContact ] = useState();
  // const { items: contacts, loaded: contactsLoaded } = useCollection(identity?.webIdData?.['apods:contacts']);
  // useEffect(() => {
  //   if( contactsLoaded && isContact === undefined ) {
  //     webfinger.fetch(params.id).then(actorUri => {
  //       setIsContact(contacts.includes(actorUri));
  //     });
  //   }
  // }, [contacts, contactsLoaded, webfinger, params, setIsContact, isContact]);

  if (!userLoaded) return null;

  const contactFormUrl = '/Profile/create/?id=' + params.id;

  if (identity?.id) return redirect(contactFormUrl);

  notify(translate('app.notification.login_to_connect_user', { username: params.id }));

  return <Redirect to={'/login?signup=true&redirect=' + encodeURIComponent(contactFormUrl)} />;
};

export default UserPage;
