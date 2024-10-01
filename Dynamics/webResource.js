define('3rdparty.bundle', [], function () {
    function appendIFrame(name, url) {
        const iframe = document.createElement('iframe');
        iframe.id = name;
        iframe.name = name;
        iframe.src = url;
        iframe.height = '0px';
        iframe.width = '200px';
        iframe.style.display = 'none';
        window.document.body.appendChild(iframe);
    }

    webResourceLocation = 'https://<path_to_html>'

    appendIFrame('customization', webResourceLocation);
});