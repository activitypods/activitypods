import React from 'react';
import { useListContext, Loading } from 'react-admin';
import { Card, List, Divider, makeStyles } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  card: {
    marginTop: 20,
    marginBottom: 20,
  },
  list: {
    padding: 0,
  },
}));

const DividedList = ({ children }) => {
  const { ids, data, loading, ...rest } = useListContext();
  const classes = useStyles();
  return loading ? (
    <Loading loadingPrimary="ra.page.loading" loadingSecondary="ra.message.loading" style={{ height: '50vh' }} />
  ) : (
    <Card className={classes.card}>
      <List className={classes.list}>
        {ids.map((id, i) => (
          <>
            {i > 0 && <Divider />}
            {React.cloneElement(children, { record: data[id], ...rest })}
          </>
        ))}
      </List>
    </Card>
  );
};

export default DividedList;
