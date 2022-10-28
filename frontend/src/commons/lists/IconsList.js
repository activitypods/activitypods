import React from 'react';
import { List, ListItem, ListItemAvatar, ListItemText, Divider, makeStyles } from '@material-ui/core';
import { getFieldLabelTranslationArgs, useShowContext, useTranslate } from 'react-admin';

const useStyles = makeStyles((theme) => ({
  root: (props) => ({
    display: 'flex',
    flexDirection: props.isVertical ? 'column' : 'row',
    alignItems: props.isVertical ? undefined : 'flex-start',
    padding: 0,
  }),
  item: (props) => ({
    flexGrow: 1,
    padding: props.isVertical ? '8px 0 8px 0' : '0 20px 0 16px',
    '&:first-child': {
      padding: props.isVertical ? '0 0 8px 0' : '0 20px 0 0',
    },
    '&:last-child': {
      padding: props.isVertical ? '8px 0 0 0' : '0 0 0 16px',
    },
  }),
  avatar: {
    minWidth: 40,
  },
  icon: {
    fontSize: '2rem',
  },
  divider: {
    backgroundColor: 'black',
  },
  primary: (props) => ({
    whiteSpace: props.isVertical ? undefined : 'nowrap',
  }),
  secondary: (props) => ({
    paddingTop: 2,
    fontSize: 14,
    whiteSpace: props.isVertical ? undefined : 'nowrap',
    '& a, & span': {
      color: 'black',
    },
  }),
}));

const primaryTypographyProps = {
  variant: 'subtitle2',
};
const secondaryTypographyProps = {
  variant: 'body2',
  color: 'textPrimary',
};

const IconsList = ({ orientation, children }) => {
  const isVertical = orientation === 'vertical';
  const translate = useTranslate();
  const classes = useStyles({ isVertical });
  const { basePath, loaded, record, resource } = useShowContext();

  if (!loaded) return null;

  const fields = React.Children.toArray(children).filter(
    (field) => field && record[field.props.source] && React.isValidElement(field)
  );

  const dividerOrientation = isVertical ? 'horizontal' : 'vertical';

  return (
    <List className={classes.root}>
      {fields.map((field, i) => {
        const label = translate(
          ...getFieldLabelTranslationArgs({
            label: field.props.label,
            resource,
            source: field.props.source,
          })
        );
        const value = React.cloneElement(field, {
          record,
          resource,
          basePath,
        });
        return (
          <React.Fragment key={i}>
            <ListItem className={classes.item} p={2}>
              {field.props.icon && (
                <ListItemAvatar className={classes.avatar}>
                  {React.cloneElement(field.props.icon, {
                    className: classes.icon,
                  })}
                </ListItemAvatar>
              )}
              <ListItemText
                primary={label}
                secondary={value}
                classes={{ primary: classes.primary, secondary: classes.secondary }}
                primaryTypographyProps={primaryTypographyProps}
                secondaryTypographyProps={secondaryTypographyProps}
              />
            </ListItem>
            {i < fields.length - 1 && (
              <Divider orientation={dividerOrientation} className={classes.divider} flexItem={!isVertical} />
            )}
          </React.Fragment>
        );
      })}
    </List>
  );
};

IconsList.defaultProps = {
  orientation: 'horizontal',
};

export default IconsList;
