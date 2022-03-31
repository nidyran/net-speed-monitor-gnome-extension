const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

//Constants
const NO_SOURCES_FOUND_MESSAGE = "NO_SOURCE";
const ERROR_READING_SOURCES = "ERROR REEADING SOURCE";
const DEBUG_PREFIX = "netSpeedMonitorDebug";
const STARTING_MESSAGE = "netSpeedMonitor";
const SOURCE_PATH = "/proc/net/dev";


const ZEROS_COUNT_TO_SWITCH_SOURCE = 10;
const DISPLAY_LOCK_DURATION = 750;
const REFRESH_RATE_STEP = 100;
const MAX_REFRESH_RATE = 1000;
const MIN_REFRESH_RATE = 200;

const DEFAULT_REFRESH_RATE = 700;
const DEFAULT_MODE = 3;

//Global variables
let oldTotalRecieveAmount = 0, oldTotalTransmitAmount = 0,selectedSourceIndex = 0;
let panelButton,panelButtonLabel,timeout,displayLockUntil;
let vailableSources, mode, refreshTime,zerosCount;

//Flags
let displayLock = false;
let debugStatus = false;
let sourceLock = false;

function init () {
}

function enable () {
    panelButton = new St.Bin({reactive: true,x_expand: true,y_expand: false,style_class : "panel-button"});
    panelButtonLabel = new St.Label({text:STARTING_MESSAGE,y_align: Clutter.ActorAlign.CENTER,style_class:"netSpeedMonitor-label"});
    panelButton.set_child(panelButtonLabel);
    panelButton.connect('button-press-event', handleButtonClickEvent);
    Main.panel._rightBox.insert_child_at_index(panelButton, 0);

    sourceLock = false;
    mode = DEFAULT_MODE;
    refreshTime = DEFAULT_REFRESH_RATE;

    zerosCount = 0;
    selectedSourceIndex = 0;

    loadAvailableSources();
    startTimer();
}

function disable () {
    stopTimer();
    Main.panel._rightBox.remove_child(panelButton);
    panelButton.destroy();
    panelButton = null;
}

function startTimer(){
    timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, refreshTime, () => {return refresh();});
}

function stopTimer(){
    if (timeout) {
        GLib.Source.remove(timeout);
        timeout = null;
    }
}

function refresh(){
    var values = loadDataUsage();

    totalRecieve = values[0];
    totalTransmit = values[1];

    if(displayLock){
        refreshDisplayLock();
    }
    else{
        if(availableSources.length == 0){
            display(NO_SOURCES_FOUND_MESSAGE)
        }
        else if(sourceLock == false && (zerosCount >= ZEROS_COUNT_TO_SWITCH_SOURCE)){
            switchSource();
        }
        else {
            if(mode == 0){
                //Download speed
                result = "↓ " + stringifyBytes(calculateSpeed(totalRecieve, oldTotalRecieveAmount)) + "/s";
            }else if(mode == 1){
                //Upload speed
                result = "↑ " + stringifyBytes(calculateSpeed(totalTransmit, oldTotalTransmitAmount)) + "/s";
            }else if (mode == 2){
                //Download speed & Upload speed
                result = "↓ " + stringifyBytes(calculateSpeed(totalRecieve, oldTotalRecieveAmount)) + "/s ↑ " + stringifyBytes(calculateSpeed(totalTransmit, oldTotalTransmitAmount)) + "/s";
            }else if (mode == 3){
                //Download speed + Upload speed
                result = "⇅ " + stringifyBytes(calculateSpeed(totalRecieve + totalTransmit, oldTotalRecieveAmount + oldTotalTransmitAmount)) + "/s";
            }else if(mode == 4){
                //Total used bytes
                result = "∑ " + stringifyBytes(totalRecieve + totalTransmit);
            }

            if(totalRecieve == 0 && totalTransmit == 0 || (totalRecieve == oldTotalRecieveAmount && totalTransmit == oldTotalTransmitAmount)){
                zerosCount = zerosCount + 1;
            }else{
                zerosCount = 0;
            }

            display(result);
        }
    }

    oldTotalRecieveAmount = totalRecieve;
    oldTotalTransmitAmount = totalTransmit;
    
    return GLib.SOURCE_CONTINUE;
}

function calculateSpeed(value, oldValue){
    if(value == null || oldValue == null || value == 0 || oldValue == 0 || value == oldValue){
        return 0;
    }
    let result = (value - oldValue) / (refreshTime / 1000);
    return result;
}

function loadDataUsage(){
    try{
        let sourceFile = Gio.file_new_for_path(SOURCE_PATH);
        let sourceFileStream = sourceFile.read(null);
        let dataInputStream = Gio.DataInputStream.new(sourceFileStream);

        let line,totalRecieve = totalTransmit = 0;

        while (line = dataInputStream.read_line(null)) {
            line = String(line).trim();
            let fields = line.split(/\W+/);

             if(fields.length>2 && (availableSources[selectedSourceIndex] == fields[0])){
                if(fields.length >= 2 && !isNaN(fields[1])){
                    totalRecieve = totalRecieve + parseInt(fields[1]);
                }
                
                if(fields.length >= 9 && !isNaN(fields[9])){
                    totalTransmit = totalTransmit + parseInt(fields[9]);
                }
            }

            if(fields.length<=2){
                break;
            }
        }

        dataInputStream.close(null);
        return [totalRecieve, totalTransmit];
    }catch(exception){
        debug("readFromFile - Error : "+exception);
        displayConfig(ERROR_READING_SOURCES);
    }
}

function loadAvailableSources(){
    try{
        let sourceFile = Gio.file_new_for_path(SOURCE_PATH);
        let sourceFileStream = sourceFile.read(null);
        let dataInputStream = Gio.DataInputStream.new(sourceFileStream);
        let line,totalRecieve = totalTransmit = 0;
        availableSources = [];
        while (line = dataInputStream.read_line(null)) {
            line = String(line).trim();
            let fields = line.split(/\W+/);
            
            if(fields.length <= 2){
                break;
            }

            let source = fields[0];
            if(source!="" && source!="face" && source != "Inter"){
                availableSources.push(fields[0]);    
            }
            
        }

        dataInputStream.close(null);
        return [totalRecieve, totalTransmit];
    }catch(exception){
        debug("loadAvailableSources - Error : "+exception); 
        displayConfig(ERROR_READING_SOURCES);   
    }
}

function handleButtonClickEvent(widget, event){
    if(event.get_button() == 1){
        switchMode();
    }else if(event.get_button() == 2){
        switchRefreshRate();
    }else if(event.get_button() == 3){
        switchSource();
        sourceLock = true;
    }
}

function switchRefreshRate(){
    if(refreshTime == MAX_REFRESH_RATE){
        refreshTime = MIN_REFRESH_RATE;
    } else{
        refreshTime = refreshTime + REFRESH_RATE_STEP;
    }
    displayConfig("Timer: "+refreshTime+"/"+MAX_REFRESH_RATE);

    stopTimer();
    startTimer();
}

function switchMode(){
    if(mode == 4){
        mode = 0;
    }else{
        mode = mode + 1;
    }
}

function switchSource(){
    if(availableSources.length > 0){
        if(selectedSourceIndex == availableSources.length - 1){
            selectedSourceIndex = 0;
        } else{
            selectedSourceIndex = selectedSourceIndex + 1;
        }
        displayConfig("Source: " + (selectedSourceIndex + 1) + "/" + (availableSources.length));
        oldTotalRecieveAmount = 0;
        oldTotalTransmitAmount = 0;
        zerosCount = 0;
    }
}

function stringifyBytes(a,b=2,k=1024){with(Math){let d=floor(log(a)/log(k));return 0==a?"0 Bytes":parseFloat((a/pow(k,d)).toFixed(max(0,b)))+" "+["Bytes","KB","MB","GB","TB","PB","EB","ZB","YB"][d]}}

function displayConfig(value){
    displayLock = false;
    display(value);
    displayLock = true;
    displayLockUntil = Date.now() + DISPLAY_LOCK_DURATION;
}

function refreshDisplayLock(){
    if(Date.now() >= displayLockUntil){
        displayLock = false;
        displayLockUntil = null;
    }
}

function display(value){panelButtonLabel.set_text(value);}

/**
 * use this command in order to debug the extension, just replace 'DEBUG_PREFIX' with its actuall value.
 * journalctl -f -o cat /usr/bin/gnome-shell | grep DEBUG_PREFIX
 */
function debug(message){if(debugStatus){log(DEBUG_PREFIX+" - "+message);}}