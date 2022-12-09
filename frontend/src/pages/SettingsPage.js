import React, { useEffect, useState, useCallback } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { email, required, useAuthProvider, useNotify, useTranslate } from 'react-admin';
import { SimpleForm, TextInput } from 'react-admin';
import { Box, Card, Typography } from '@material-ui/core';

const validateEmail = [required(), email('app.validation.email')]
const validateConfirmNewPassword = [(value, { newPassword, confirmNewPassword }) => {
	if (!newPassword) return;

	if (newPassword !== confirmNewPassword) {
		return 'app.validation.confirmNewPassword'
	}
	return;
}];

const SettingsPage = () => {
	const translate = useTranslate();
	const notify = useNotify();
	const { identity } = useCheckAuthenticated();
	const authProvider = useAuthProvider();

	const [formDefaultValue, setFormDefaultValue] = useState({
		email: "",
		currentPassword: "",
		newPassword: "",
		confirmNewPassword: ""
	})

	useEffect(() => {
		authProvider.getAccountSettings().then((res) => {
			setFormDefaultValue({ ...formDefaultValue, email: res.email })
		});
		// eslint-disable-next-line
	}, [setFormDefaultValue, authProvider])

	const onSubmit = useCallback(
		async (params) => {
			try {
				await authProvider.updateAccountSettings({ ...params })
				notify('auth.message.account_settings_updated', 'success');
			}
			catch (error) {
				notify(error.message, 'error');
			}
		},
		[authProvider, notify]
	);

	if (!identity?.id) return null;

	return (
		<>
			<Typography variant="h2" component="h1">
				{translate('app.page.settings')}
			</Typography>
			<Box mt={1}>
				<Card>
					<SimpleForm initialValues={formDefaultValue} save={onSubmit}>
						<TextInput
							label={translate('app.input.email')}
							source="email"
							type="email"
							validate={validateEmail}
							fullWidth
						/>
						<TextInput
							label={translate('app.input.current_password')}
							source="currentPassword"
							type="password"
							validate={required()}
							fullWidth
						/>
						<TextInput
							label={translate('app.input.new_password')}
							source="newPassword"
							type="password"
							fullWidth
						/>
						<TextInput
							label={translate('app.input.confirm_new_password')}
							source="confirmNewPassword"
							type="password"
							validate={validateConfirmNewPassword}
							fullWidth
						/>
					</SimpleForm>
				</Card>
			</Box>
		</>
	)

};


export default SettingsPage;