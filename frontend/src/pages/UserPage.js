import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetIdentity, useNotify, useTranslate } from 'react-admin';

const UserPage = () => {
  const params = useParams();
  const { data: identity, isLoading } = useGetIdentity();
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();

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

  useEffect(() => {
    const contactFormUrl = '/Profile/create/?id=' + params.id;
    if (identity?.id) {
      navigate(contactFormUrl);
    } else if (!isLoading) {
      notify(translate('app.notification.login_to_connect_user', { username: params.id }));
      navigate('/login?signup=true&redirect=' + encodeURIComponent(contactFormUrl));
    }
  }, [identity, isLoading, params.id, notify, translate, navigate]);

  return null;
};

export default UserPage;
