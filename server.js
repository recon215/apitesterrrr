const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const cors = require('cors');
const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const port = process.env.PORT || 3000; // Adjust to use the port provided by Heroku dynamically

const connection = mysql.createConnection({
    host: 'sql5.freesqldatabase.com',
    user: 'sql5683328',
    password: 'X8jD4UR4WR',
    database: 'sql5683328'
});
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com', // Outlook SMTP server
    port: 587, // Outlook SMTP port (587 for TLS)
    secure: false, // Set to false since Outlook uses STARTTLS
    auth: {
        user: 'api.skyfall@outlook.com', // Your Outlook email address
        pass: 'Jordy215$' // Your Outlook password or app-specific password
    }
});
// Connect to the database
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to MySQL database');
});
// Define your endpoint
app.get('/stock', (req, res) => {
    // Query the database to retrieve stock information
    const query = 'SELECT country, country_code, slots FROM stock';
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Error querying database:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        // Format the results
        const stocks = results.map(stock => ({
            country: stock.country,
            country_code: stock.country_code,
            slots: stock.slots
        }));

        // Send the formatted stock data in the response
        res.json(stocks);
    });
});

app.post('/upgrade', (req, res) => {
    const { Key, Email, CountryCode } = req.query;

    // Check if all required parameters are provided
    if (!Key || !Email || !CountryCode) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    // Check if the key exists
    const keyQuery = 'SELECT * FROM codes WHERE `key` = ?';
    connection.query(keyQuery, [Key], (error, keyResults) => {
        if (error) {
            console.error('Error querying database:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        // If key does not exist
        if (keyResults.length === 0) {
            return res.status(403).json({ error: 'Invalid key' });
        }

        // Check if the key was used in the last 2 weeks
        const lastUsedDate = new Date(keyResults[0].used_timestamp);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        if (lastUsedDate > twoWeeksAgo) {
            // Calculate the date when the key can be used again
            const nextAvailableDate = new Date(lastUsedDate);
            nextAvailableDate.setDate(nextAvailableDate.getDate() + 14);
            return res.status(401).json({ error: `This key cannot be used until ${nextAvailableDate.toDateString()}` });
        }

        // Fetch a random invite and address from the specified country's table
        const selectRandomQuery = `SELECT invite, address FROM ${CountryCode}_invites ORDER BY RAND() LIMIT 1`;
        connection.query(selectRandomQuery, (selectError, selectResults) => {
            if (selectError) {
                console.error('Error selecting random record from database:', selectError);
                return res.status(500).json({ error: 'Database error' });
            }

            // Assuming there's at least one record in the country's invites table
            const { invite, address } = selectResults[0];

            // Email sending function
            function sendEmail(email, invite, address) {
                // Email content
                const mailOptions = {
                    from: 'api.skyfall@outlook.com', // Sender address
                    to: email, // Recipient address
                    subject: 'Your Upgrade Successful Link INSIDE!!', // Email subject
                    html: `
                        <p>Congratulations! You've successfully upgraded.</p>
                        <p>Here's your invite: ${invite}</p>
                        <p>And your address: ${address}</p>
                    `
                };

                // Send the email
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending email:', error);
                    } else {
                        console.log('Email sent:', info.response);
                    }
                });
            }

            // Inside your '/upgrade' endpoint after retrieving the random invite and address
            sendEmail(Email, invite, address);

            // Update the database to mark the key as used, store the email, and timestamp
            const updateQuery = 'UPDATE codes SET used = 1, email = ?, used_timestamp = CURRENT_TIMESTAMP() WHERE `key` = ?';
            connection.query(updateQuery, [Email, Key], (updateError, updateResults) => {
                if (updateError) {
                    console.error('Error updating database:', updateError);
                    return res.status(500).json({ error: 'Database error' });
                }

                // Delete the invite and address that was sent to the user
                const deleteQuery = `DELETE FROM ${CountryCode}_invites WHERE invite = ? AND address = ?`;
                connection.query(deleteQuery, [invite, address], (deleteError, deleteResults) => {
                    if (deleteError) {
                        console.error('Error deleting invite and address:', deleteError);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.status(200).json({ message: 'Upgrade successful' });
                });
            });
        });
    });
});




app.get('/renew', (req, res) => {
    const { Key, email } = req.query;

    // Check if all required parameters are provided
    if (!Key || !email) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    // Check if the key exists
    const query = 'SELECT * FROM codes WHERE `key` = ?';
    connection.query(query, [Key], (error, results) => {
        if (error) {
            console.error('Error querying database:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(403).json({ error: 'Invalid key' });
        }

        const keyInfo = results[0];
        const currentDate = new Date();
        const keyLastUsedDate = new Date(keyInfo.used_timestamp);

        // Calculate the difference in milliseconds between the current date and the last used date
        const timeDifference = currentDate.getTime() - keyLastUsedDate.getTime();
        const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

        // Check if the key has been used within the past two weeks (14 days)
        if (daysDifference < 14) {
            // Calculate the date when the key can be used again
            const availableDate = new Date(keyLastUsedDate.getTime() + 14 * 24 * 60 * 60 * 1000);

            return res.status(403).json({
                error: `Key has been used within the past two weeks, please wait until ${availableDate.toISOString().split('T')[0]}`
            });
        }

        // Check if the key has not been upgraded yet
        if (!keyInfo.used) {
            // Fetch a random invite and address from your accounts table
            const selectRandomQuery = 'SELECT invite, address FROM invites ORDER BY RAND() LIMIT 1';
            connection.query(selectRandomQuery, (selectError, selectResults) => {
                if (selectError) {
                    console.error('Error selecting random record from database:', selectError);
                    return res.status(500).json({ error: 'Database error' });
                }

                // Assuming there's at least one record in the accounts table
                const { invite, address } = selectResults[0];

                // Email sending function
                function sendEmail(email, invite, address) {
                    // Email content
                    const mailOptions = {
                        from: 'api.skyfall@outlook.com', // Sender address
                        to: email, // Recipient address
                        subject: 'Your Upgrade Successful Link INSIDE!!', // Email subject
                        html: `
                            <p>Congratulations! You've successfully renewed your key.</p>
                            <p>Here's your new invite: ${invite}</p>
                            <p>And your new address: ${address}</p>
                        `
                    };

                    // Send the email
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.error('Error sending email:', error);
                        } else {
                            console.log('Email sent:', info.response);
                        }
                    });
                }

                // Inside your '/renew' endpoint after retrieving the random invite and address
                sendEmail(email, invite, address);

                // Update the database to update the email associated with the key
                const updateQuery = 'UPDATE codes SET email = ?, used_timestamp = CURRENT_TIMESTAMP() WHERE `key` = ?';
                connection.query(updateQuery, [email, Key], (updateError, updateResults) => {
                    if (updateError) {
                        console.error('Error updating database:', updateError);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.status(200).json({ message: 'Key renewed successfully', invite, address });
                });
            });
        } else {
            return res.status(403).json({ error: 'Key has already been upgraded' });
        }
    });
});

app.get('/info', (req, res) => {
    const { Key } = req.query;

    // Check if the key parameter is provided
    if (!Key) {
        return res.status(400).json({ error: 'Missing key parameter' });
    }

    // Query the database to retrieve information about the key
    const query = 'SELECT email, used_timestamp FROM codes WHERE `key` = ?';
    connection.query(query, [Key], (error, results) => {
        if (error) {
            console.error('Error querying database:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        // Check if the key exists in the database
        if (results.length === 0) {
            return res.status(404).json({ error: 'Key not found' });
        }

        const keyInfo = results[0];

        // Get the email and used timestamp from the database results
        const { email, used_timestamp } = keyInfo;

        // Calculate the date when the key can be used again
        const currentDate = new Date();
        const keyLastUsedDate = new Date(used_timestamp);
        const timeDifference = currentDate.getTime() - keyLastUsedDate.getTime();
        const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
        const availableDate = new Date(keyLastUsedDate.getTime() + 14 * 24 * 60 * 60 * 1000);

        // Prepare the response data
        const responseData = {
            email,
            used_timestamp,
            available_date: daysDifference < 14 ? availableDate.toISOString().split('T')[0] : null
        };

        // Send the response
        res.status(200).json(responseData);
    });
});



// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
