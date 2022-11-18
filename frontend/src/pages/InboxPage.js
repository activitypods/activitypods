import React, { useEffect } from 'react';
import { useInbox } from "@semapps/activitypub-components";

const InboxPage = () => {
  const inbox = useInbox();
  useEffect(() => {
    inbox.fetch({}).then(activities => console.log(activities))
  }, [inbox]);
  return (
    <div>Ma boîte aux lettres</div>
  );
};

export default InboxPage;
