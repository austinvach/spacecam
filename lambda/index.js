const AWS = require("aws-sdk");
const axios = require("axios");
const Alexa = require("ask-sdk-core");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

// REPLACE THE PLACEHOLDERS WITH YOUR OWN INFO:
// SKILL_ID: Find yours in the Alexa Developer Console: https://developer.amazon.com/alexa/console/ask
// ALEXA_CLIENT_ID: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.
// ALEXA_CLIENT_SECRET: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.

const AlexaClientID = "amzn1.application-oa2-client.0431b82f3ff846268dee6377f0b0e545";
const AlexaClientSecret = "ea6a4f23b9be50217d024d7bd8c7d33f11294441dcea3b0ad1ead069fa2cd92d";
const SkillID = "amzn1.ask.skill.89e99eea-cac1-407a-93ff-2116e58a0546";
const SkillStage = "development";

// WIDGET SPECIFIC HANDLERS

const InstallWidgetRequestHandler = {
    canHandle(handlerInput) {
        // console.log("InstallWidgetRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.InstallRequest"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    handle(handlerInput) {
        // console.log("InstallWidgetRequestHandler handle");
        const request = handlerInput.requestEnvelope.request;

        const installPackageDirective = {
            type: "Alexa.DataStore.PackageManager.InstallPackage",
            dataStorePackage: {
                packageVersion: "1.1",
                packageType: "WIDGET",
                manifest: {
                    type: "Link",
                    src: `package://alexa/datastore/packages/${request.packageId}/manifest.json`,
                },
                content: {
                    document: {
                        type: "Link",
                        src: `package://alexa/datastore/packages/${request.packageId}/document.json`,
                    },
                    datasources: {
                        type: "Link",
                        src: `package://alexa/datastore/packages/${request.packageId}/datasources/default.json`,
                    }
                }
            }
        };
        
        const speakOutput = `Installing the ${request.packageId} widget`;
        
        return handlerInput.responseBuilder
            .addDirective(installPackageDirective)
            .speak(speakOutput)
            .getResponse();
    },
};

const RemoveWidgetRequestHandler = {
    canHandle(handlerInput) {
        // console.log("RemoveWidgetRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.PackageRemoved"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    handle(handlerInput) {
        // console.log("RemoveWidgetRequestHandler handle");
        const request = handlerInput.requestEnvelope.request;
        const speakOutput = `The ${request.packageId} widget has been removed.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

const WidgetEventHandler = {
    canHandle(handlerInput) {
        // console.log("WidgetEventHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent";
        // If your widget has more than one button, you'll want to check
        // the event source ID to determine which button triggered the event.
        // e.g. return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" && handlerInput.requestEnvelope.request.source.id === 'sourceID';
    },
    handle(handlerInput) {
        // console.log("WidgetEventHandler handle");
        // Since I want my skill to launch when the widget is tapped I'm
        // just returning the LaunchRequestHandler's handle function.
        return LaunchRequestHandler.handle(handlerInput);
    },
};

const UpdateWidgetIntentHandler = {
    canHandle(handlerInput) {
        // console.log("UpdateWidgetIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "UpdateWidget";
    },
    async handle(handlerInput) {
        // console.log("UpdateWidgetIntentHandler handle");
    
        // Prepping the first API call to get NASA's astromony picture of the day (APOD).
        // APOD Docs - https://github.com/nasa/apod-api
        // Axios Docs - https://axios-http.com/docs/api_intro
        var config = {
            method: "get",
            timeout: 1000,
            url: "https://api.nasa.gov/planetary/apod",
            params: {
                api_key: "DEMO_KEY" //You can get your own API key at https://api.nasa.gov/#signUp.
            }
        };
        // Calling the NASA API
        var response = await axios(config);
        
        // Saving results for later use
        // Data Persistence Docs - https://developer.amazon.com/en-US/docs/alexa/hosted-skills/alexa-hosted-skills-session-persistence.html
        const attributesManager = handlerInput.attributesManager;
        let attributes = {
            "apodURL":response.data.url,
            "apodDate":response.data.date,
            "apodTitle":response.data.title,
            "apodExplanation":response.data.explanation
        };
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        // Prepping the second API call to fetch access token.
        config = {
            method: "post",
            url: "https://api.amazon.com/auth/o2/token",
            timeout: 1000,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "charset": "utf-8",
            },
            params: {
                grant_type: "client_credentials",
                client_id: AlexaClientID,
                client_secret: AlexaClientSecret,
                scope: "alexa::datastore"
            }
        };
        response = await axios(config);
        
        // Prepping the third API call to push data to the widget.
        // Getting the ID of the device that the user spoke to so that we can target that specific widget in our update.
        const DeviceID = handlerInput.requestEnvelope.context.System.device.deviceId;
        config = {
            method: "post",
            url: `https://api.amazonalexa.com/v1/datastore/${SkillID}_${SkillStage}/executeCommands`,
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `${response.data.token_type} ${response.data.access_token}`
            },
            data : {
                "commands": [
                    {
                        "type": "PutObject",
                        "namespace": "myNamespace",
                        "key": "myKey",
                        "content": {
                            "imageSource": attributes.apodURL
                        }
                    }
                ],
                "targets": [
                    {
                        "type": "DEVICE_ID",
                        "targetId": DeviceID
                    }
                ]
            }
        };
        
        response = await axios(config);

        const speakOutput = response.data.dispatchResults[0].code;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    },
};

// STANDARD HANDLERS

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        // console.log("LaunchRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
    },
    async handle(handlerInput) {
        // console.log("LaunchRequestHandler handle");
        
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes() || {};
        console.log(`=== LOADING PERSISTENT ATTRIBUTES: ${attributes}`);
        
        var speakOutput = "";
        
        if(attributes.hasOwnProperty('apodDate') && attributes.hasOwnProperty('apodTitle')) {
            speakOutput = `The picture for ${attributes.apodDate} is called ${attributes.apodTitle}. Tap the screen to learn more about this photo.`;
        } else {
            speakOutput = "This is a placholder image. To see NASA's picture of the day, ask to update the widget.";
        }
        

        // Check if the user's device supports APL. If yes, send an APL response.
        if (Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)["Alexa.Presentation.APL"]) {
            // Add the RenderDocument directive to the response
            handlerInput.responseBuilder
                .addDirective({
                    type: "Alexa.Presentation.APL.RenderDocument",
                    document: {
                        src: "doc://alexa/apl/documents/launch",
                        type: "Link",
                    },
                    datasources: {
                        apod: {
                            img: attributes.hasOwnProperty('apodURL') ? attributes.apodURL : "https://images.pexels.com/photos/4644812/pexels-photo-4644812.jpeg",
                            title: attributes.hasOwnProperty('apodTitle') ? attributes.apodTitle : "Placeholder Image",
                            properties: {
                                exp: attributes.hasOwnProperty('apodExplanation') ? attributes.apodExplanation : speakOutput,
                            },
                            transformers: [
                                {
                                    inputPath: "exp",
                                    outputName: "expSpeech",
                                    transformer: "textToSpeech",
                                }
                            ]
                        }
                    }
                }
            );
        } else {
            speakOutput = "This skill shows images from NASA. Try launching this skill on a device with a screen.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        // console.log("HelpIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent";
    },
    handle(handlerInput) {
        // console.log("HelpIntentHandler handle");
        const speakOutput = "You can say hello to me! How can I help?";

        return handlerInput.responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        // console.log("CancelAndStopIntentHandler canHandle");
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
                && (Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.CancelIntent"
                || Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.StopIntent")
        );
    },
    handle(handlerInput) {
        // console.log("CancelAndStopIntentHandler handle");
        const speakOutput = "Goodbye!";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        // console.log("FallbackIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.FallbackIntent";
    },
    handle(handlerInput) {
        // console.log("FallbackIntentHandler handle");
        const speakOutput = "Sorry, I don't know about that. Please try again.";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        // console.log("SessionEndedRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "SessionEndedRequest";
    },
    handle(handlerInput) {
        // console.log("SessionEndedRequestHandler handle");
        console.log(`=== SESSION ENDED: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder
            .getResponse(); // notice we send an empty response
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        // console.log("IntentReflectorHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest";
    },
    handle(handlerInput) {
        // console.log("IntentReflectorHandler handle");
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return (
            handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse()
        );
    }
};

const ErrorHandler = {
    canHandle() {
        // console.log("ErrorHandler canHandle");
        return true;
    },
    handle(handlerInput, error) {
        // console.log("ErrorHandler handle");
        const speakOutput = "Sorry, I had trouble doing what you asked. Please try again.";
        console.log(`=== ERROR HANDLED: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// REQUEST INTERCEPTORS

const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log(`=== INCOMING SKILL REQUEST: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    }
};

// RESPONSE INTERCEPTORS

const LoggingResponseInterceptor = {
    process(handlerInput, response) {
        console.log(`=== OUTGOING SKILL RESPONSE: ${JSON.stringify(response)}`);
    }
};

//  This handler acts as the entry point for your skill, routing all request and response
//  payloads to the handlers above. Make sure any new handlers or interceptors you've
//  defined are included below. The order matters - they're processed top to bottom

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        InstallWidgetRequestHandler,
        UpdateWidgetIntentHandler,
        RemoveWidgetRequestHandler,
        WidgetEventHandler,
        LaunchRequestHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler
    )
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(LoggingRequestInterceptor)
    .addResponseInterceptors(LoggingResponseInterceptor)
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        })
    )
    .lambda();
