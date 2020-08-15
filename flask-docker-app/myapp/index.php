<!DOCTYPE html>
<html>
    <head>
        <title>Sysdig Demo</title>
    </head>
    <body>
        <p>
            Hello. Today is <?= date('l \t\h\e jS') ?>.
        </p>
    </body>
    
    <?php 
    
    // PHP program to obtain IP address of 
    // the server 
    
    // Creating a variable to store the 
    // server address 
    $hostname = gethostname();
    $ip_server = $_SERVER['SERVER_ADDR']; 
    
    // Printing the stored address 
    echo "Hostname is: $hostname. Host IP is: $ip_server"; 
    
    ?> 

</html>
