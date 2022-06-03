const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { exec } = require("child_process");
const CONFIG = require("./creds/config.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file.upload"];
const TOKEN_PATH = CONFIG.token_path;
const FILENAME_SUFFIX = CONFIG.file_name;
const date = new Date();
const dateStr =
  ("00" + date.getDate()).slice(-2) + "-" +
  ("00" + (date.getMonth() + 1)).slice(-2) + "-" +
  date.getFullYear() + "_" +
  ("00" + date.getHours()).slice(-2) + "-" +
  ("00" + date.getMinutes()).slice(-2) + "-" +
  ("00" + date.getSeconds()).slice(-2);

const file_upload_name = `${dateStr}_${FILENAME_SUFFIX}`;

fs.readFile("creds/" + CONFIG.credentials_path, (err, content) => {
    if (err) return console.log("Error loading client secret file:", err);
    authorize(JSON.parse(content), storeFiles);
});

function authorize(credentials, callback) {
	const { client_secret, client_id, redirect_uris } = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(
		client_id,
		client_secret,
		redirect_uris[0]
	);

	fs.readFile("creds/" + TOKEN_PATH, (err, token) => {
		if (err) {
			return getAccessToken(oAuth2Client, callback);
		}
		oAuth2Client.setCredentials(JSON.parse(token));
		callback(oAuth2Client);
	});
}

function getAccessToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES
	});
	console.log("Authorize this app by visiting this url:", authUrl);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.question("Enter the code from that page here: ", code => {
		rl.close();
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error("Error retrieving access token", err);
			oAuth2Client.setCredentials(token);

			fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
				if (err) return console.error(err);
			});
			callback(oAuth2Client);
		});
	});
}

function storeFiles(auth) {
    exec(`mysqldump -u${CONFIG.db_username} -p${CONFIG.db_password.replace(/(["'$`\\])/g,'\\$1')} ${CONFIG.db_name} ${CONFIG.tables.join(" ")} | gzip > ${file_upload_name}.sql.gz`, (err, stdout, stderr) => {
        if (err) {
            //some err occurred
            console.error(err);
        } else {
            // the *entire* stdout and stderr (buffered)
            const drive = google.drive({ version: "v3", auth });
            var fileMetadata = {
                name: `${file_upload_name}.sql.gz`,
                parents: [CONFIG.google_drive_folder]
            };
            var media = {
                mimeType: "application/x-gzip",
                body: fs.createReadStream(`${file_upload_name}.sql.gz`)
            };
            drive.files.create(
                {
                    resource: fileMetadata,
                    media: media,
                    fields: "id"
                },
                function(err, file) {
                    if (err) {
                        // Handle error
                        console.error(err);
                    } else {
                        console.log("Upload Id: ", file.data.id);
                    }
                    fs.unlink(`${file_upload_name}.sql.gz`, function(err){
                        if(err) console.error(err)
                    })
                }
            ); 
        }
    });
}
