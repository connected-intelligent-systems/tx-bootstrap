export interface RegistrationConfirmationData {
  organizationName: string;
  registrationToken: string;
  statusUrl: string;
}

export interface BpnApprovedData {
  organizationName: string;
  bpn: string;
  statusUrl?: string;
}

export interface ParticipantRejectedData {
  organizationName: string;
  reason: string;
}

export interface CredentialsReadyData {
  organizationName: string;
  bpn: string;
  statusUrl?: string;
}

export interface TokenResendData {
  organizationName: string;
  registrationToken: string;
  statusUrl: string;
}

export const emailTemplates = {
  registrationConfirmation: (data: RegistrationConfirmationData) => ({
    subject: "Registration Confirmation - Dataspace Onboarding",
    text: `
Dear ${data.organizationName},

Thank you for registering for dataspace onboarding. Your onboarding request has been received and is being reviewed by our team.

Registration Details:
- Organization: ${data.organizationName}
- Registration token: ${data.registrationToken}

You can check the status of your registration at any time using the link below:
${data.statusUrl}

IMPORTANT: Save this link - you will need it to check your status and download credentials once approved.

What happens next:
1. Our team will review your organization information
2. We will verify your Business Partner Number (BPN) request
3. Once approved, you'll be able to download your credentials from the status page

If you have any questions, please contact our support team.

Best regards,
Dataspace Operations Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #1976d2; }
    .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
    .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Registration Confirmation</h1>
    </div>
    <div class="content">
      <p>Dear ${data.organizationName},</p>
      <p>Thank you for registering for dataspace onboarding. Your onboarding request has been received and is being reviewed by our team.</p>

      <div class="details">
        <strong>Registration Details:</strong><br>
        Organization: ${data.organizationName}<br>
        Registration token: ${data.registrationToken}
      </div>

      <div class="warning">
        <strong>⚠️ IMPORTANT:</strong> Save the link below - you will need it to check your status and download credentials once approved.
      </div>

      <center>
        <a href="${data.statusUrl}" class="button">Check Registration Status</a>
      </center>

      <h3>What happens next:</h3>
      <ol>
        <li>Our team will review your organization information</li>
        <li>We will verify your Business Partner Number (BPN) request</li>
        <li>Once approved, you'll be able to download your credentials from the status page</li>
      </ol>

      <p>If you have any questions, please contact our support team.</p>
    </div>
    <div class="footer">
      <p>Dataspace Operations Team</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),

  bpnApproved: (data: BpnApprovedData) => ({
    subject: "BPN Approved - Your Dataspace Credentials Are Ready",
    text: `
Dear ${data.organizationName},

Great news! Your Business Partner Number (BPN) has been approved and your dataspace credentials are ready for download.

Your BPN: ${data.bpn}

${
  data.statusUrl
    ? `You can now download your credentials from your status page:\n${data.statusUrl}`
    : "Please visit your onboarding status page (link provided in your registration email) to download your credentials."
}

Next Steps:
1. Visit the status page ${data.statusUrl ? "using the link above" : ""}
2. Download your credential package
3. Configure your connector with the provided credentials
4. Begin participating in the dataspace

Welcome to the dataspace!

Best regards,
Dataspace Operations Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4caf50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .success { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0; }
    .bpn { font-size: 24px; font-weight: bold; color: #1976d2; text-align: center; padding: 20px; background-color: white; margin: 15px 0; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ BPN Approved!</h1>
    </div>
    <div class="content">
      <p>Dear ${data.organizationName},</p>

      <div class="success">
        <strong>Great news!</strong> Your Business Partner Number (BPN) has been approved and your dataspace credentials are ready for download.
      </div>

      <div class="bpn">
        ${data.bpn}
      </div>

      <center>
        <a href="${data.statusUrl}" class="button">Download Credentials</a>
      </center>

      <h3>Next Steps:</h3>
      <ol>
        <li>Visit the status page using the link above</li>
        <li>Download your credential package</li>
        <li>Configure your connector with the provided credentials</li>
        <li>Begin participating in the dataspace</li>
      </ol>

      <p><strong>Welcome to the dataspace!</strong></p>
    </div>
    <div class="footer">
      <p>Dataspace Operations Team</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),

  participantRejected: (data: ParticipantRejectedData) => ({
    subject: "Dataspace Participation Update",
    text: `
Dear ${data.organizationName},

We regret to inform you that your dataspace participation request cannot proceed at this time.

Reason: ${data.reason}

If you believe this was a mistake or have questions about the rejection, please contact our support team with your case information.

Best regards,
Dataspace Operations Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .error { background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 15px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dataspace Participation Update</h1>
    </div>
    <div class="content">
      <p>Dear ${data.organizationName},</p>

      <div class="error">
        We regret to inform you that your dataspace participation request cannot proceed at this time.
      </div>

      <p><strong>Reason:</strong> ${data.reason}</p>

      <p>If you believe this was a mistake or have questions about the rejection, please contact our support team with your case information.</p>
    </div>
    <div class="footer">
      <p>Dataspace Operations Team</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),

  credentialsReady: (data: CredentialsReadyData) => ({
    subject: "Your Dataspace Credentials Are Ready",
    text: `
Dear ${data.organizationName},

Your dataspace credentials are now ready for download!

BPN: ${data.bpn}

Download your credentials here:
${data.statusUrl}

Please download and securely store your credentials. You will need them to configure your dataspace connector.

Best regards,
Dataspace Operations Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4caf50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Credentials Ready!</h1>
    </div>
    <div class="content">
      <p>Dear ${data.organizationName},</p>
      <p>Your dataspace credentials are now ready for download!</p>

      <p><strong>BPN:</strong> ${data.bpn}</p>

      <center>
        <a href="${data.statusUrl}" class="button">Download Credentials</a>
      </center>

      <p>Please download and securely store your credentials. You will need them to configure your dataspace connector.</p>
    </div>
    <div class="footer">
      <p>Dataspace Operations Team</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),

  tokenResend: (data: TokenResendData) => ({
    subject: "Your Registration Status Link",
    text: `
Dear ${data.organizationName},

Here is your registration status link as requested:

${data.statusUrl}

Registration token: ${data.registrationToken}

You can use this link to check the status of your onboarding and download credentials once approved.

Best regards,
Dataspace Operations Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Registration Status Link</h1>
    </div>
    <div class="content">
      <p>Dear ${data.organizationName},</p>
      <p>Here is your registration status link as requested:</p>

      <center>
        <a href="${data.statusUrl}" class="button">Check Registration Status</a>
      </center>

      <p><strong>Registration token:</strong> ${data.registrationToken}</p>
      <p>You can use this link to check the status of your onboarding and download credentials once approved.</p>
    </div>
    <div class="footer">
      <p>Dataspace Operations Team</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }),
};
