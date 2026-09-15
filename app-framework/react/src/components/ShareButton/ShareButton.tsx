import React, { useState } from 'react';
import { Button, useRecordContext, useTranslate } from 'react-admin';
import ShareIcon from '@mui/icons-material/Share';
import { useCollection } from '@semapps/activitypub-components';
import ShareDialog from './ShareDialog';

/**
 * Allow to share the record in the current RecordContext
 * Use the `Announce` and `Offer > Announce` activities handled by ActivityPods
 */
const ShareButton = ({ profileResource = 'Profile', groupResource = 'Group' }) => {
  const [shareOpen, setShareOpen] = useState(false);
  const record = useRecordContext();
  const { error, isLoading } = useCollection(record?.['apods:announces']);
  const translate = useTranslate();
  // If the user can see the list of announces, it means he can share
  if (!isLoading && !error) {
    return (
      <>
        <Button label={translate('apods.action.share')} onClick={() => setShareOpen(true)}>
          <ShareIcon />
        </Button>
        {shareOpen && (
          <ShareDialog
            resourceUri={record.id}
            close={() => setShareOpen(false)}
            profileResource={profileResource}
            groupResource={groupResource}
          />
        )}
      </>
    );
  } else {
    return null;
  }
};

export default ShareButton;
